/**
 * Virginia VDACS — Animal Custody Records Adapter
 *
 * Scrapes shelter intake/outcome statistics from the Virginia Department
 * of Agriculture and Consumer Services (VDACS) public reporting system.
 *
 * Virginia mandates all releasing agencies report annually.
 * Data source: https://arr.vdacs.virginia.gov/PublicReports
 *
 * Each report has:
 *   Reason for Custody (Intake):  A=OnHand, B=Stray, C=Seized, D=BiteCase,
 *                                  E=Surrendered, F=TransferIn-VA, G=TransferIn-OOS, H=Other
 *   Method of Disposition (Outcome): J=Reclaimed, K=Adopted, L=TransferOut-VA,
 *                                     M=TransferOut-OOS, N=DiedInCustody, O=Euthanized,
 *                                     P=Other, Q=OnHandDec31
 */

export interface VdacsShelterReport {
    sysFacNo: string;
    agencyName: string;
    city: string;
    county: string;
    state: 'VA';
    agencyType: string;
    reportYear: number;
    /** Total intake across all species (dogs + cats) — sum of columns B-H (excludes A=On Hand Jan 1) */
    totalIntake: number;
    /** Total euthanized across all species (dogs + cats) — column O */
    totalEuthanized: number;
    /** Total adopted — column K */
    totalAdopted: number;
    /** Total reclaimed by owner — column J */
    totalReclaimed: number;
    /** Total transfers out — columns L + M */
    totalTransferred: number;
    /** Died in custody — column N */
    totalDied: number;
    /** Live release rate as percentage */
    liveReleaseRate: number;
    /** Breakdown by category */
    dogs: { intake: number; euthanized: number; adopted: number };
    cats: { intake: number; euthanized: number; adopted: number };
}

const BASE_URL = 'https://arr.vdacs.virginia.gov';
const REPORT_URL = `${BASE_URL}/PublicReports/ViewReport`;
const SELECT_URL = `${BASE_URL}/Home/SelectReportNew`;

/** All 459 VDACS agency IDs for 2024, extracted from the dropdown */
const VDACS_AGENCY_IDS_2024 = '7087,6931,71,6847,6760,6869,105,6860,6856,174,6943,6917,232,171,126,6784,6799,4,132,81,6960,4376,7039,6864,3802,133,7086,6742,236,6814,6761,176,7072,4826,6841,82,3840,237,6874,53,7061,6940,238,65,6965,6986,239,7002,6961,7047,6945,240,51,6837,241,242,106,207,6893,6861,7057,54,7036,7091,7089,6862,135,6801,243,7044,3617,7008,67,159,7071,15,7102,6775,14,7078,6903,7066,6955,244,99,6857,6808,170,208,6804,6751,122,58,7083,245,7069,6889,7118,7001,5228,210,6952,7040,83,7006,6876,6810,211,246,6829,201,5025,6859,247,7095,6919,161,6907,6755,248,249,7105,7114,6988,162,7073,7056,213,4913,163,6740,6882,6858,250,164,6781,214,70,7046,251,6798,165,166,7034,7013,7092,252,63,225,168,6934,6936,7075,7113,6964,216,226,60,227,140,73,6922,6887,124,6948,7054,6823,228,7027,4827,100,7097,229,141,74,7096,7003,230,7042,4515,231,253,23,7033,256,6909,6789,7053,255,97,6849,217,6932,7084,7065,257,143,258,7082,145,6756,259,6835,144,6990,6743,7021,6777,218,146,7110,6875,6846,6871,103,6996,104,6967,260,147,6786,7103,7094,59,6946,6807,127,262,5040,6797,5551,6746,263,88,264,79,17,6868,6958,7011,24,35,6757,6973,265,266,6880,6913,6991,55,6951,6738,149,7018,4069,89,7088,7062,6838,3621,220,7101,180,150,7009,267,233,6853,6854,90,268,129,6824,151,7038,6970,6825,6944,7085,269,152,6888,270,6800,6879,6890,6954,7026,181,153,7043,5,272,182,107,6870,6971,6811,3109,6851,6764,7104,7117,204,6750,273,6865,6915,4264,7028,156,157,38,183,6902,7108,7076,6901,6984,274,7081,125,158,5013,6778,275,3844,276,277,278,6883,7100,56,7067,7111,184,5550,3842,6896,6788,91,7079,7077,6953,7030,7059,139,185,131,6878,136,6993,6759,6979,19,280,6753,109,52,110,6855,111,6918,6831,281,6975,7005,7115,7055,6938,187,7090,6933,7,6963,282,6848,6822,7035,6832,57,6968,6873,6830,7010,283,6920,6792,116,7109,188,7049,202,7031,10,6783,7112,284,118,222,7116,189,6937,190,6770,223,224,6981,6999,7020,6794,197,175,6852,7029,6773,7060,7024,7068,148,6916,33,6863,77,155,2840,7070,6998,6900,6885,7058,6819,93,191,7052,80,192,50,6767,6836,7045,119,101,193,3618,198,195,6911,120,203,7074,6925,6941,7107,6972,6842,199,196,200'.split(',');

/**
 * Fetch the list of all agency IDs for a given year.
 * Tries the AJAX endpoint first; falls back to hardcoded IDs.
 */
export async function fetchAgencyList(year: number, category = 'AL'): Promise<Array<{ sysFacNo: string; name: string }>> {
    // Try AJAX endpoint first (requires session cookie — may return empty)
    try {
        const url = `${BASE_URL}/Reports06/fnFacilityDD?year=${year}&vCategory=${category}`;
        const resp = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (animal welfare research)' },
        });
        if (resp.ok) {
            const html = await resp.text();
            const regex = /<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/gi;
            const agencies: Array<{ sysFacNo: string; name: string }> = [];
            let match;
            while ((match = regex.exec(html)) !== null) {
                const name = match[2].replace(/\s*-\s*\d{4}\s*$/, '').trim();
                if (name) agencies.push({ sysFacNo: match[1], name });
            }
            if (agencies.length > 0) return agencies;
        }
    } catch { /* Fall through to hardcoded IDs */ }

    // Fallback: use hardcoded IDs (names will be fetched from individual reports)
    console.log('   ℹ Using pre-extracted agency ID list (AJAX endpoint requires session)');
    return VDACS_AGENCY_IDS_2024.map(id => ({ sysFacNo: id, name: `Agency ${id}` }));
}

/**
 * Fetch and parse a single agency report
 */
export async function fetchAgencyReport(
    sysFacNo: string,
    year: number,
): Promise<VdacsShelterReport | null> {
    const url = `${REPORT_URL}?SysFacNo=${sysFacNo}&Calendar_Year=${year}`;

    const resp = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'GoldenYearsClub/1.0 (animal welfare research)' },
    });
    if (!resp.ok) return null;

    const html = await resp.text();

    // Parse agency info
    const agencyName = extractField(html, 'Agency Name:') || `Agency ${sysFacNo}`;
    const city = extractField(html, 'City:') || '';
    const county = extractField(html, 'County:') || '';
    const agencyType = extractField(html, 'Agency Type:') || '';

    // Parse Reason for Custody table (intake)
    const intakeTable = parseTable(html, 'Reason for Custody');
    // Parse Method of Disposition table (outcome)
    const dispositionTable = parseTable(html, 'Method of Disposition');

    if (!intakeTable || !dispositionTable) return null;

    // Extract values for Dogs and Cats from intake table
    // Columns: A=OnHand, B=Stray, C=Seized, D=BiteCaseQ, E=Surrendered, F=TransferVA, G=TransferOOS, H=Other, Total
    const dogsIntakeRow = intakeTable.find(r => r.species === 'Dogs');
    const catsIntakeRow = intakeTable.find(r => r.species === 'Cats');
    const totalIntakeRow = intakeTable.find(r => r.species === 'Total');

    // Extract values for Dogs and Cats from disposition table
    // Columns: J=Reclaimed, K=Adopted, L=TransferVA, M=TransferOOS, N=Died, O=Euthanized, P=Other, Q=OnHandDec31, Total
    const dogsDispRow = dispositionTable.find(r => r.species === 'Dogs');
    const catsDispRow = dispositionTable.find(r => r.species === 'Cats');
    const totalDispRow = dispositionTable.find(r => r.species === 'Total');

    // Calculate totals: intake = Total - OnHand Jan 1 (column A, index 0)
    // For dogs: sum columns B through H (indices 1-7)
    const dogsIntake = dogsIntakeRow ? sumColumns(dogsIntakeRow.values, 1, 7) : 0;
    const catsIntake = catsIntakeRow ? sumColumns(catsIntakeRow.values, 1, 7) : 0;
    const totalIntake = dogsIntake + catsIntake;

    // Disposition values (0-indexed: J=0, K=1, L=2, M=3, N=4, O=5, P=6, Q=7)
    const dogsEuth = dogsDispRow?.values[5] ?? 0;
    const catsEuth = catsDispRow?.values[5] ?? 0;
    const totalEuth = dogsEuth + catsEuth;

    const dogsAdopted = dogsDispRow?.values[1] ?? 0;
    const catsAdopted = catsDispRow?.values[1] ?? 0;
    const totalAdopted = dogsAdopted + catsAdopted;

    const dogsReclaimed = dogsDispRow?.values[0] ?? 0;
    const catsReclaimed = catsDispRow?.values[0] ?? 0;
    const totalReclaimed = dogsReclaimed + catsReclaimed;

    const dogsTransferred = (dogsDispRow?.values[2] ?? 0) + (dogsDispRow?.values[3] ?? 0);
    const catsTransferred = (catsDispRow?.values[2] ?? 0) + (catsDispRow?.values[3] ?? 0);
    const totalTransferred = dogsTransferred + catsTransferred;

    const dogsDied = dogsDispRow?.values[4] ?? 0;
    const catsDied = catsDispRow?.values[4] ?? 0;
    const totalDied = dogsDied + catsDied;

    // Live release rate
    const liveReleaseRate = totalIntake > 0
        ? Math.round(((totalIntake - totalEuth - totalDied) / totalIntake) * 100)
        : 0;

    return {
        sysFacNo,
        agencyName,
        city,
        county,
        state: 'VA',
        agencyType,
        reportYear: year,
        totalIntake,
        totalEuthanized: totalEuth,
        totalAdopted,
        totalReclaimed,
        totalTransferred,
        totalDied,
        liveReleaseRate,
        dogs: { intake: dogsIntake, euthanized: dogsEuth, adopted: dogsAdopted },
        cats: { intake: catsIntake, euthanized: catsEuth, adopted: catsAdopted },
    };
}

// ── Helpers ──

function extractField(html: string, label: string): string | null {
    // Pattern: <td>Label</td><td>Value</td>  or similar
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
        `${escaped}\\s*</(?:td|th|dt|span)>\\s*<(?:td|dd|span)[^>]*>\\s*([^<]+)`,
        'i'
    );
    const match = regex.exec(html);
    return match ? match[1].trim() : null;
}

interface TableRow {
    species: string;
    values: number[];
}

function parseTable(html: string, sectionName: string): TableRow[] | null {
    // Find the section containing this table
    const sectionIdx = html.indexOf(sectionName);
    if (sectionIdx === -1) return null;

    // Find the next <table> after the section header
    const tableStart = html.indexOf('<table', sectionIdx);
    if (tableStart === -1) return null;
    const tableEnd = html.indexOf('</table>', tableStart);
    if (tableEnd === -1) return null;
    const tableHtml = html.substring(tableStart, tableEnd + 8);

    // Parse rows
    const rows: TableRow[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let isHeader = true;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        if (isHeader) { isHeader = false; continue; } // skip header row(s)

        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
            cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }

        if (cells.length >= 2) {
            const species = cells[0].trim();
            const values = cells.slice(1).map(c => {
                const n = parseInt(c.replace(/,/g, ''), 10);
                return isNaN(n) ? 0 : n;
            });
            rows.push({ species, values });
        }
    }

    return rows.length > 0 ? rows : null;
}

function sumColumns(values: number[], start: number, end: number): number {
    let sum = 0;
    for (let i = start; i <= end && i < values.length; i++) {
        sum += values[i];
    }
    return sum;
}
