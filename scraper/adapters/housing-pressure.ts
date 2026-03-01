/**
 * Housing Pressure Adapter
 *
 * Cross-references housing affordability data with shelter intake
 * to find correlations between economic pressure and pet surrender.
 *
 * Data sources:
 * - HUD Fair Market Rent (FMR) data — annual, by county
 * - Census ACS — median rent, eviction data
 * - Shelter Animals Count — intake trends (from our DB)
 *
 * The adapter fetches HUD FMR data via their public API and
 * computes year-over-year rent changes by county.
 */

// HUD FMR API (no key required for summary data)
const HUD_FMR_URL = 'https://www.huduser.gov/hudapi/public/fmr/data';
const HUD_STATE_URL = 'https://www.huduser.gov/hudapi/public/fmr/statedata';

export interface HousingPressureRecord {
    county: string;
    state: string;
    year: number;
    medianRent: number | null;
    rentChangeYoY: number | null;
    evictionRate: number | null;
    shelterIntakeChange: number | null;
    correlationScore: number | null;
}

// US states with known high-mill and high-surrender areas
const PRIORITY_STATES = [
    'TX', 'CA', 'FL', 'NY', 'PA', 'OH', 'GA', 'NC', 'AZ', 'CO',
    'TN', 'MO', 'IN', 'AL', 'SC', 'LA', 'KY', 'OR', 'OK', 'NV',
];

/**
 * Fetch HUD Fair Market Rent data for a state.
 * FMR represents the 40th percentile of local rental costs.
 */
async function fetchHUDRents(state: string, year: number): Promise<Map<string, number>> {
    const rents = new Map<string, number>();

    try {
        const url = `${HUD_STATE_URL}/${state}?year=${year}`;
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'GoldenYearsClub/1.0 (housing-pressure-integration)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) {
            // HUD API may require a token for some endpoints
            return rents;
        }

        const data = await resp.json();

        // The response format varies; try common structures
        if (Array.isArray(data)) {
            for (const item of data) {
                const county = item.county_name || item.name || '';
                const rent = item.fmr_2br || item.fmr_2_br || item.median_rent || 0;
                if (county && rent > 0) {
                    rents.set(county.replace(/ County$/i, '').trim(), rent);
                }
            }
        } else if (data.data && Array.isArray(data.data)) {
            for (const item of data.data) {
                const county = item.county_name || item.name || '';
                const rent = item.fmr_2br || item.basicdata?.fmr_2br || 0;
                if (county && rent > 0) {
                    rents.set(county.replace(/ County$/i, '').trim(), rent);
                }
            }
        }
    } catch {
        // Silently fail for individual states
    }

    return rents;
}

/**
 * Compute year-over-year rent change and correlate with shelter data.
 */
function computeCorrelation(
    currentRent: number,
    previousRent: number | undefined,
    shelterIntakeChange: number | null,
): { rentChangeYoY: number | null; correlationScore: number | null } {
    if (!previousRent || previousRent === 0) {
        return { rentChangeYoY: null, correlationScore: null };
    }

    const rentChangeYoY = ((currentRent - previousRent) / previousRent) * 100;

    // Simple correlation: if both rent and intake increased, positive correlation
    if (shelterIntakeChange !== null) {
        const rentDirection = rentChangeYoY > 0 ? 1 : -1;
        const intakeDirection = shelterIntakeChange > 0 ? 1 : -1;
        const correlationScore = rentDirection === intakeDirection
            ? Math.min(Math.abs(rentChangeYoY) * Math.abs(shelterIntakeChange), 100)
            : -Math.min(Math.abs(rentChangeYoY) * Math.abs(shelterIntakeChange), 100);
        return { rentChangeYoY: Math.round(rentChangeYoY * 10) / 10, correlationScore: Math.round(correlationScore * 10) / 10 };
    }

    return { rentChangeYoY: Math.round(rentChangeYoY * 10) / 10, correlationScore: null };
}

/**
 * Fetch housing pressure data for priority states.
 * Computes rent YoY changes and prepares for shelter intake correlation.
 */
export async function fetchHousingPressure(year?: number): Promise<HousingPressureRecord[]> {
    const targetYear = year || new Date().getFullYear();
    const prevYear = targetYear - 1;

    console.log(`   🏠 Fetching housing pressure data for ${targetYear}...`);
    console.log(`   📋 Checking ${PRIORITY_STATES.length} priority states...`);

    const records: HousingPressureRecord[] = [];
    let statesWithData = 0;

    for (const state of PRIORITY_STATES) {
        const [currentRents, previousRents] = await Promise.all([
            fetchHUDRents(state, targetYear),
            fetchHUDRents(state, prevYear),
        ]);

        if (currentRents.size === 0) continue;
        statesWithData++;

        for (const [county, rent] of currentRents) {
            const prevRent = previousRents.get(county);
            const { rentChangeYoY, correlationScore } = computeCorrelation(
                rent, prevRent, null // shelter intake change filled later
            );

            records.push({
                county,
                state,
                year: targetYear,
                medianRent: rent,
                rentChangeYoY,
                evictionRate: null,  // would come from eviction lab data
                shelterIntakeChange: null,  // cross-referenced from ShelterIntakeStats
                correlationScore,
            });
        }
    }

    console.log(`   ✅ ${records.length} county-level records from ${statesWithData} states`);

    // Highlight counties with biggest rent increases
    const hotspots = records
        .filter(r => r.rentChangeYoY !== null && r.rentChangeYoY > 10)
        .sort((a, b) => (b.rentChangeYoY || 0) - (a.rentChangeYoY || 0))
        .slice(0, 10);

    if (hotspots.length > 0) {
        console.log(`\n   🔥 Top rent increase hotspots:`);
        for (const h of hotspots) {
            console.log(`      ${h.county}, ${h.state}: +${h.rentChangeYoY}% ($${h.medianRent}/mo)`);
        }
    }

    return records;
}
