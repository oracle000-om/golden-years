/**
 * State Kennel Records Adapter
 *
 * Generic multi-state framework for scraping state-level kennel
 * inspection and licensing databases. Each state has different
 * data formats and access methods:
 *
 * - PA: Dog Law Enforcement search portal (HTML scraping)
 * - MO: ACFA licensed facility list (PDF/web table)
 * - KS: Kansas Dept of Agriculture kennel license list
 *
 * States to add later: IA (IDALS), OH (high-volume retail)
 */

export interface StateKennelInspection {
    certNumber: string;          // state-issued license number
    licenseType: string;         // state license type designation
    legalName: string;
    siteName: string | null;
    city: string | null;
    state: string;               // 2-letter code
    zipCode: string | null;
    inspectionDate: Date;
    inspectionType: string | null;
    criticalViolations: number;
    nonCritical: number;
    animalCount: number | null;
    narrativeExcerpt: string | null;
    reportUrl: string | null;
    dataSource: 'MO_STATE' | 'PA_STATE' | 'IA_STATE' | 'OH_STATE' | 'KS_STATE';
}

export interface StateKennelConfig {
    state: string;
    dataSource: 'MO_STATE' | 'PA_STATE' | 'IA_STATE' | 'OH_STATE' | 'KS_STATE';
    name: string;
    fetchFn: () => Promise<StateKennelInspection[]>;
}

// ── Pennsylvania Dog Law Enforcement ──

const PA_KENNEL_URL = 'https://www.agriculture.pa.gov/Animals/DogLaw/Pages/Licensed-Kennels.aspx';

async function fetchPAKennels(): Promise<StateKennelInspection[]> {
    console.log(`      📥 Fetching Pennsylvania kennel records...`);

    try {
        const resp = await fetch(PA_KENNEL_URL, {
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (state-kennel-integration)' },
            signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
            console.log(`      ⚠️  PA source returned ${resp.status}, skipping`);
            return [];
        }

        const html = await resp.text();

        // Parse the kennel table from HTML
        const inspections: StateKennelInspection[] = [];
        const tableMatch = html.match(/<table[^>]*class="[^"]*kennel[^"]*"[^>]*>([\s\S]*?)<\/table>/i);

        if (!tableMatch) {
            console.log(`      ⚠️  Could not find kennel table in PA page, format may have changed`);
            // Create entries from available structured data on the page
            // This is a stub — actual implementation depends on the page structure
            return [];
        }

        // Extract rows from table
        const rowMatches = tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

        for (const rowMatch of rowMatches) {
            const cells = [...(rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))].map(
                m => m[1].replace(/<[^>]+>/g, '').trim()
            );

            if (cells.length < 4) continue;

            const name = cells[0] || '';
            const city = cells[1] || null;
            const licenseNum = cells[2] || '';
            const animalCountStr = cells[3] || '';

            if (!name || !licenseNum) continue;

            inspections.push({
                certNumber: `PA-${licenseNum}`,
                licenseType: 'STATE_KENNEL',
                legalName: name,
                siteName: null,
                city,
                state: 'PA',
                zipCode: null,
                inspectionDate: new Date(),  // license listing date
                inspectionType: 'LICENSE',
                criticalViolations: 0,
                nonCritical: 0,
                animalCount: parseInt(animalCountStr, 10) || null,
                narrativeExcerpt: null,
                reportUrl: PA_KENNEL_URL,
                dataSource: 'PA_STATE',
            });
        }

        console.log(`      ✅ PA: ${inspections.length} kennel records parsed`);
        return inspections;
    } catch (err: any) {
        console.log(`      ❌ PA fetch failed: ${err.message?.substring(0, 100)}`);
        return [];
    }
}

// ── Missouri ACFA ──

const MO_ACFA_URL = 'https://agriculture.mo.gov/animals/acfa/';

async function fetchMOKennels(): Promise<StateKennelInspection[]> {
    console.log(`      📥 Fetching Missouri ACFA kennel records...`);

    try {
        const resp = await fetch(MO_ACFA_URL, {
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (state-kennel-integration)' },
            signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
            console.log(`      ⚠️  MO source returned ${resp.status}, skipping`);
            return [];
        }

        const html = await resp.text();

        // Look for facility listing links or embedded data
        const inspections: StateKennelInspection[] = [];

        // MO ACFA doesn't provide a structured table — look for PDF links
        // to licensed facility lists
        const pdfMatches = html.matchAll(/href="([^"]*(?:licensed|facility|kennel)[^"]*\.pdf)"/gi);
        const pdfUrls = [...pdfMatches].map(m => m[1]);

        if (pdfUrls.length === 0) {
            console.log(`      ⚠️  No facility list PDFs found on MO ACFA page`);
            console.log(`      ℹ️  MO data may require manual extraction or FOIA request`);
            return [];
        }

        console.log(`      📄 Found ${pdfUrls.length} facility list PDF(s) — PDF parsing not yet implemented`);
        console.log(`      ℹ️  Use data/mo-kennels.json seed file for manually extracted data`);

        return inspections;
    } catch (err: any) {
        console.log(`      ❌ MO fetch failed: ${err.message?.substring(0, 100)}`);
        return [];
    }
}

// ── Kansas Dept of Agriculture ──

const KS_KENNEL_URL = 'https://agriculture.ks.gov/divisions-programs/division-of-animal-health/';

async function fetchKSKennels(): Promise<StateKennelInspection[]> {
    console.log(`      📥 Fetching Kansas kennel records...`);

    try {
        const resp = await fetch(KS_KENNEL_URL, {
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (state-kennel-integration)' },
            signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
            console.log(`      ⚠️  KS source returned ${resp.status}, skipping`);
            return [];
        }

        const html = await resp.text();

        // Kansas publishes kennel license data — look for spreadsheet/PDF links
        const inspections: StateKennelInspection[] = [];

        const excelMatches = html.matchAll(/href="([^"]*(?:kennel|license|breeder)[^"]*\.(?:xlsx?|csv))"/gi);
        const excelUrls = [...excelMatches].map(m => m[1]);

        if (excelUrls.length === 0) {
            console.log(`      ⚠️  No kennel license files found on KS page`);
            return [];
        }

        console.log(`      📄 Found ${excelUrls.length} data file(s) — parsing not yet implemented`);
        return inspections;
    } catch (err: any) {
        console.log(`      ❌ KS fetch failed: ${err.message?.substring(0, 100)}`);
        return [];
    }
}

// ── State Registry ──

export const STATE_CONFIGS: StateKennelConfig[] = [
    {
        state: 'PA',
        dataSource: 'PA_STATE',
        name: 'Pennsylvania Dog Law',
        fetchFn: fetchPAKennels,
    },
    {
        state: 'MO',
        dataSource: 'MO_STATE',
        name: 'Missouri ACFA',
        fetchFn: fetchMOKennels,
    },
    {
        state: 'KS',
        dataSource: 'KS_STATE',
        name: 'Kansas Dept of Agriculture',
        fetchFn: fetchKSKennels,
    },
];

/**
 * Fetch kennel records from all configured states.
 * Gracefully handles individual state failures.
 *
 * @param states Optional filter — only fetch from these states
 */
export async function fetchStateKennelRecords(states?: string[]): Promise<StateKennelInspection[]> {
    const configs = states
        ? STATE_CONFIGS.filter(c => states.includes(c.state))
        : STATE_CONFIGS;

    console.log(`   🏭 Fetching kennel records from ${configs.length} state(s)...`);

    const allInspections: StateKennelInspection[] = [];

    for (const config of configs) {
        console.log(`\n   📋 ${config.name} (${config.state}):`);
        try {
            const inspections = await config.fetchFn();
            allInspections.push(...inspections);
        } catch (err: any) {
            console.log(`   ❌ ${config.state} failed: ${err.message?.substring(0, 150)}`);
        }
    }

    console.log(`\n   ✅ ${allInspections.length} total state kennel records across ${configs.length} state(s)`);
    return allInspections;
}
