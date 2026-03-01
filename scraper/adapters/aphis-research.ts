/**
 * USDA Research Facility Annual Reports Adapter
 *
 * Fetches research facility annual report data from the USDA APHIS
 * Public Search Tool's Salesforce Aura API.
 *
 * Source: https://aphis.my.site.com/PublicSearchTool/s/annual-reports
 *
 * The old direct CSV download at aphis.usda.gov is gone (404).
 * This adapter uses the Salesforce Lightning (Aura) controller action
 * that powers the Public Search Tool's "Annual Reports" tab.
 *
 * API: POST /PublicSearchTool/s/sfsites/aura
 *   Action: apex://EFL_PSTController/ACTION$doARSearch  → animal counts
 *   Action: apex://EFL_PSTController/ACTION$doCustomerQuery_AR → facility metadata
 *
 * Cert number format: XX-R-XXXX where XX is the USDA state code.
 */

const AURA_ENDPOINT = 'https://aphis.my.site.com/PublicSearchTool/s/sfsites/aura';
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety limit (~20K rows max)

export interface ResearchFacilityReport {
    certNumber: string;
    name: string;
    state: string;
    city: string | null;
    totalDogs: number;
    totalCats: number;
    totalAnimals: number;
    painCategoryC: number;
    painCategoryD: number;
    painCategoryE: number;
    reportYear: number;
}

/**
 * USDA APHIS state code → postal abbreviation.
 * These are *not* FIPS codes — they're APHIS-specific certificate prefixes.
 */
const APHIS_STATE_MAP: Record<string, string> = {
    '11': 'CT', '12': 'ME', '13': 'MA', '14': 'NH', '15': 'RI', '16': 'VT',
    '21': 'NY', '22': 'NJ',
    '31': 'DE', '32': 'DC', '33': 'MD', '34': 'PA', '35': 'VA', '36': 'WV',
    '41': 'AL', '42': 'FL', '43': 'GA', '44': 'KY', '45': 'MS', '46': 'NC',
    '47': 'SC', '48': 'TN',
    '51': 'IL', '52': 'IN', '53': 'MI', '54': 'MN', '55': 'OH', '56': 'WI',
    '61': 'AR', '62': 'LA', '63': 'NM', '64': 'OK', '65': 'TX',
    '71': 'IA', '72': 'KS', '73': 'MO', '74': 'NE',
    '81': 'CO', '82': 'MT', '83': 'ND', '84': 'SD', '85': 'UT', '86': 'WY',
    '87': 'AZ', '88': 'CA', '89': 'HI', '90': 'ID', '91': 'NV',
    '92': 'OR', '93': 'WA', '94': 'AK',
};

/**
 * Extract state abbreviation from USDA certificate number.
 * Format: XX-R-XXXX where XX is the APHIS state code.
 */
function stateFromCert(certNumber: string): string | null {
    const match = certNumber.match(/^(\d{2})-/);
    if (!match) return null;
    return APHIS_STATE_MAP[match[1]] || null;
}

/**
 * Build the Aura request body for the doARSearch action.
 */
function buildSearchPayload(year: string, pageIndex: number, getCount: boolean): URLSearchParams {
    const message = JSON.stringify({
        actions: [{
            id: `${Date.now()};a`,
            descriptor: 'apex://EFL_PSTController/ACTION$doARSearch',
            callingDescriptor: 'markup://c:EFL_PSTSearchResults',
            params: {
                searchCriteria: {
                    index: pageIndex,
                    numberOfRows: PAGE_SIZE,
                    isARSearch: true,
                    year,
                },
                parentId: null,
                getCount,
                hasException: false,
                hasColE: false,
            },
        }],
    });

    const context = JSON.stringify({
        mode: 'PROD',
        fwuid: '',
        app: 'siteforce:communityApp',
        loaded: {},
        dn: [],
        globals: {},
        uad: true,
    });

    const params = new URLSearchParams();
    params.set('message', message);
    params.set('aura.context', context);
    params.set('aura.pageURI', '/PublicSearchTool/s/annual-reports');
    params.set('aura.token', 'null');
    return params;
}

/**
 * Parse a single facility record from the Aura response.
 */
function parseRecord(r: Record<string, any>, year: number): ResearchFacilityReport | null {
    const certNumber = (r.certNumber || '').trim();
    if (!certNumber) return null;

    // Derive state from cert number prefix
    const state = stateFromCert(certNumber);
    if (!state) return null;

    const dogs = Number(r.dogs) || 0;
    const cats = Number(r.cats) || 0;

    // Skip facilities that don't use dogs or cats
    if (dogs === 0 && cats === 0) return null;

    // Compute totals from all species columns
    const guineaPigs = Number(r.guineaPigs) || 0;
    const hamsters = Number(r.hamsters) || 0;
    const rabbits = Number(r.rabbits) || 0;
    const primates = Number(r.nonHumanPrimates) || 0;
    const pigs = Number(r.pigs) || 0;
    const sheep = Number(r.sheep) || 0;
    const otherFarm = Number(r.otherFarmAnimals) || 0;
    const allOther = Number(r.allOtherAnimals) || 0;
    const total = dogs + cats + guineaPigs + hamsters + rabbits + primates + pigs + sheep + otherFarm + allOther;

    return {
        certNumber,
        name: certNumber, // Name requires a separate API call; use cert as placeholder
        state,
        city: null,       // City requires doCustomerQuery_AR; omit for now
        totalDogs: dogs,
        totalCats: cats,
        totalAnimals: total,
        painCategoryC: 0, // Pain categories require individual report PDFs
        painCategoryD: 0,
        painCategoryE: 0,
        reportYear: year,
    };
}

/**
 * Fetch research facility annual report data from the APHIS Public Search Tool.
 */
export async function fetchResearchFacilities(year?: number): Promise<ResearchFacilityReport[]> {
    const reportYear = year || new Date().getFullYear() - 1;
    console.log(`   📥 Querying APHIS Public Search Tool for FY ${reportYear} research facility reports...`);

    // First request: get the total count + first page
    const countPayload = buildSearchPayload(String(reportYear), 0, true);
    const countResp = await fetch(AURA_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'LittleBuddyClub/1.0 (research-facility-scraper)',
        },
        body: countPayload.toString(),
        signal: AbortSignal.timeout(30_000),
    });

    if (!countResp.ok) {
        console.log(`   ⚠️  APHIS API returned ${countResp.status}`);
        console.log(`   ℹ️  The Salesforce Aura endpoint may have changed.`);
        console.log(`   ℹ️  Check: https://aphis.my.site.com/PublicSearchTool/s/annual-reports`);
        return [];
    }

    const countData = await countResp.json();
    const firstAction = countData?.actions?.[0];

    if (!firstAction || firstAction.state !== 'SUCCESS') {
        console.log(`   ⚠️  API returned non-SUCCESS state: ${firstAction?.state || 'unknown'}`);
        if (firstAction?.error?.length) {
            console.log(`   ❌ Error: ${JSON.stringify(firstAction.error).substring(0, 200)}`);
        }
        return [];
    }

    const returnValue = firstAction.returnValue || {};
    const totalRows = returnValue.totalCount || 0;
    const firstPageRecords: Record<string, any>[] = returnValue.results || [];

    console.log(`   📊 Total reports for FY ${reportYear}: ${totalRows}`);

    // Collect all records across pages
    const allRecords: Record<string, any>[] = [...firstPageRecords];
    const totalPages = Math.min(Math.ceil(totalRows / PAGE_SIZE), MAX_PAGES);

    for (let page = 1; page < totalPages; page++) {
        if (page % 5 === 0 || page === totalPages - 1) {
            const pct = Math.round(((page + 1) / totalPages) * 100);
            console.log(`   📄 Page ${page + 1}/${totalPages} (${pct}%)...`);
        }

        const payload = buildSearchPayload(String(reportYear), page, false);
        try {
            const resp = await fetch(AURA_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'LittleBuddyClub/1.0 (research-facility-scraper)',
                },
                body: payload.toString(),
                signal: AbortSignal.timeout(30_000),
            });

            if (!resp.ok) {
                console.log(`   ⚠️  Page ${page + 1} returned ${resp.status}, stopping.`);
                break;
            }

            const data = await resp.json();
            const pageAction = data?.actions?.[0];
            if (pageAction?.state !== 'SUCCESS') {
                console.log(`   ⚠️  Page ${page + 1} returned non-SUCCESS, stopping.`);
                break;
            }

            const pageRecords = pageAction.returnValue?.results || [];
            if (pageRecords.length === 0) break;
            allRecords.push(...pageRecords);
        } catch (err: any) {
            console.log(`   ⚠️  Page ${page + 1} error: ${err.message?.substring(0, 80)}`);
            break;
        }

        // Be polite — 200ms between pages
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`   📦 Retrieved ${allRecords.length} raw records`);

    // Parse and filter
    const facilities: ResearchFacilityReport[] = [];
    let skipped = 0;

    for (const r of allRecords) {
        const parsed = parseRecord(r, reportYear);
        if (parsed) {
            facilities.push(parsed);
        } else {
            skipped++;
        }
    }

    console.log(`   ✅ ${facilities.length} research facilities using dogs/cats (${skipped} skipped)`);
    return facilities;
}
