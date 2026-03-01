/**
 * Shelter Animals Count Adapter
 *
 * Fetches national shelter intake and outcome data from
 * Shelter Animals Count (shelteranimalscount.org), an ASPCA initiative.
 *
 * Data includes:
 * - Intake by reason (stray, surrender, seizure)
 * - Outcomes (adoption, euthanasia, transfer, RTO)
 * - Live release rates
 * - Monthly state-level aggregates
 */

const SAC_DATA_URL = 'https://www.shelteranimalscount.org/data/data-download';
const SAC_EXPLORE_URL = 'https://www.shelteranimalscount.org/data/explore-the-data';

export interface ShelterIntakeRecord {
    state: string;
    month: number;
    year: number;
    intakeDogs: number;
    intakeCats: number;
    surrenderCount: number;
    strayCount: number;
    seizureCount: number;
    euthDogs: number;
    euthCats: number;
    liveReleaseRate: number | null;
}

/**
 * Parse CSV data from Shelter Animals Count.
 */
function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                currentField += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                currentField += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
                currentRow.push(currentField.trim());
                currentField = '';
                if (currentRow.length > 1) rows.push(currentRow);
                currentRow = [];
                if (ch === '\r') i++;
            } else {
                currentField += ch;
            }
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 1) rows.push(currentRow);
    }

    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return rows.slice(1).map(row => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = row[i] || '';
        }
        return obj;
    });
}

/**
 * Aggregate raw shelter records into state-level monthly stats.
 */
function aggregateByStateMonth(
    records: Record<string, string>[]
): ShelterIntakeRecord[] {
    const key = (state: string, month: number, year: number) => `${state}-${month}-${year}`;
    const agg = new Map<string, ShelterIntakeRecord>();

    for (const r of records) {
        const state = (r.state || r.st || '').trim().toUpperCase();
        if (!state || state.length !== 2) continue;

        const month = parseInt(r.month || '1', 10);
        const year = parseInt(r.year || r.report_year || '', 10);
        if (!year) continue;

        const k = key(state, month, year);
        const existing = agg.get(k) || {
            state, month, year,
            intakeDogs: 0, intakeCats: 0,
            surrenderCount: 0, strayCount: 0, seizureCount: 0,
            euthDogs: 0, euthCats: 0,
            liveReleaseRate: null,
        };

        const species = (r.species || '').toLowerCase();
        const intakeCount = parseInt(r.total_intake || r.intake_total || '0', 10);
        const euthCount = parseInt(r.euthanasia || r.euth || '0', 10);

        if (species.includes('dog') || species.includes('canine')) {
            existing.intakeDogs += intakeCount;
            existing.euthDogs += euthCount;
        } else if (species.includes('cat') || species.includes('feline')) {
            existing.intakeCats += intakeCount;
            existing.euthCats += euthCount;
        }

        existing.surrenderCount += parseInt(r.owner_surrender || r.surrender || '0', 10);
        existing.strayCount += parseInt(r.stray || r.stray_intake || '0', 10);
        existing.seizureCount += parseInt(r.seized || r.confiscated || r.seizure || '0', 10);

        const lrr = parseFloat(r.live_release_rate || r.live_outcome_rate || '');
        if (!isNaN(lrr) && (existing.liveReleaseRate === null || lrr > 0)) {
            existing.liveReleaseRate = lrr;
        }

        agg.set(k, existing);
    }

    return Array.from(agg.values());
}

/**
 * Fetch shelter intake statistics from Shelter Animals Count.
 */
export async function fetchShelterIntakeStats(): Promise<ShelterIntakeRecord[]> {
    console.log(`   📥 Fetching Shelter Animals Count data...`);

    try {
        const resp = await fetch(SAC_DATA_URL, {
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (shelter-intake-integration)' },
            signal: AbortSignal.timeout(60_000),
        });

        if (!resp.ok) {
            console.log(`   ⚠️  Direct download returned ${resp.status}`);
            console.log(`   ℹ️  Shelter Animals Count may require registration for bulk data`);
            console.log(`   ℹ️  Visit ${SAC_EXPLORE_URL} to explore available data`);
            console.log(`   ℹ️  Download the CSV manually and place at data/shelter-animals-count.csv`);
            return [];
        }

        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('csv') && !contentType.includes('text')) {
            console.log(`   ⚠️  Response is not CSV (${contentType}), may need manual download`);
            return [];
        }

        const csv = await resp.text();
        const records = parseCsv(csv);
        console.log(`   📊 ${records.length} raw records parsed`);

        const stats = aggregateByStateMonth(records);
        console.log(`   ✅ ${stats.length} state-month intake records ready`);
        return stats;
    } catch (err: any) {
        console.log(`   ❌ Fetch failed: ${err.message?.substring(0, 100)}`);
        console.log(`   ℹ️  Download manually from: ${SAC_EXPLORE_URL}`);
        return [];
    }
}
