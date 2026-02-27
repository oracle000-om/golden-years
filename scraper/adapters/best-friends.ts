/**
 * Best Friends Pet Lifesaving Dashboard Adapter
 *
 * Scrapes the Best Friends dashboard to extract shelter-level
 * save rates and no-kill status.
 *
 * The dashboard is JS-rendered and loads data dynamically,
 * so we use their underlying data API endpoints when possible.
 *
 * Source: https://bestfriends.org/…/pet-lifesaving-dashboard
 */

// Best Friends uses a Tableau/similar dashboard backend.
// The underlying data is also available via their national dataset annual release.
// For now, we can use their published CSV data when available.

export interface BestFriendsShelterId {
    shelterName: string;
    city: string;
    state: string;
    saveRate: number;          // 0.0–1.0
    noKillStatus: string;      // 'YES' | 'NEARLY' | 'NO'
    dataYear: number;
    liveIntakes: number | null;
    nonLiveOutcomes: number | null;
}

/**
 * Map a save rate to no-kill status.
 * Best Friends definition: ≥90% = no-kill, 85-89% = nearly, <85% = not.
 */
function computeNoKillStatus(saveRate: number): string {
    if (saveRate >= 0.90) return 'YES';
    if (saveRate >= 0.85) return 'NEARLY';
    return 'NO';
}

/**
 * Fetch Best Friends data.
 *
 * Strategy: Best Friends publishes an annual national dataset.
 * Their dashboard loads data via a backend API. We try multiple approaches:
 *
 * 1. Check for a published CSV/data download
 * 2. Attempt to hit the dashboard's data API
 * 3. Fall back to browser scraping
 */
export async function fetchBestFriendsData(): Promise<BestFriendsShelterId[]> {
    console.log(`   📥 Fetching Best Friends lifesaving data...`);

    // Approach 1: Try the Shelter Pet Data Alliance public data endpoint
    // Best Friends publishes aggregate data through SPDA
    const spda = await trySpda();
    if (spda.length > 0) return spda;

    // Approach 2: Try the Best Friends API endpoints
    const apiData = await tryBestFriendsApi();
    if (apiData.length > 0) return apiData;

    console.log(`   ⚠ Could not automatically fetch Best Friends data.`);
    console.log(`   Best Friends data must be obtained via:`);
    console.log(`     1. Request from bestfriends.org/research (annual dataset)`);
    console.log(`     2. Browser scraping of the dashboard (run-best-friends.ts handles this)`);

    return [];
}

async function trySpda(): Promise<BestFriendsShelterId[]> {
    try {
        // Shelter Pet Data Alliance public endpoint
        const resp = await fetch('https://shelterpetdata.org/api/data/national', {
            headers: { 'User-Agent': 'GoldenYearsClub/1.0' },
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return [];
        const data = await resp.json() as any;
        console.log(`   📊 SPDA returned data: ${JSON.stringify(data).substring(0, 200)}...`);
        // Parse if we get structured shelter data
        // For now this is exploratory
        return [];
    } catch {
        return [];
    }
}

async function tryBestFriendsApi(): Promise<BestFriendsShelterId[]> {
    // Known Best Friends API patterns:
    const endpoints = [
        'https://bestfriends.org/api/v1/dashboard/shelters',
        'https://bestfriends.org/api/dashboard/data',
        'https://bestfriends.org/jsonapi/node/dashboard_shelter',
    ];

    for (const url of endpoints) {
        try {
            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'GoldenYearsClub/1.0',
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            });
            if (resp.ok) {
                const text = await resp.text();
                console.log(`   📡 ${url} returned: ${text.substring(0, 300)}...`);
                // Parse if structured
            }
        } catch {
            // Expected — most will fail
        }
    }

    return [];
}

/**
 * Parse Best Friends CSV data (if downloaded manually or from annual release).
 * Expected columns: Organization Name, City, State, Save Rate, Live Intakes, Non-Live Outcomes, Year
 */
export function parseBestFriendsCsv(csvText: string): BestFriendsShelterId[] {
    const lines = csvText.split('\n');
    if (lines.length < 2) return [];

    const records: BestFriendsShelterId[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parse — may need to handle quoted fields
        const fields = line.split(',').map(f => f.trim().replace(/"/g, ''));

        // Flexible column matching
        const name = fields[0] || '';
        const city = fields[1] || '';
        const state = fields[2] || '';
        const saveRateStr = fields[3] || '';

        const saveRate = parseFloat(saveRateStr);
        if (isNaN(saveRate) || !name || !state) continue;

        // Normalize save rate (could be 0-100 or 0-1)
        const normalizedRate = saveRate > 1 ? saveRate / 100 : saveRate;

        records.push({
            shelterName: name,
            city,
            state: state.toUpperCase(),
            saveRate: normalizedRate,
            noKillStatus: computeNoKillStatus(normalizedRate),
            dataYear: parseInt(fields[6] || '2024', 10) || 2024,
            liveIntakes: parseInt(fields[4] || '', 10) || null,
            nonLiveOutcomes: parseInt(fields[5] || '', 10) || null,
        });
    }

    return records;
}
