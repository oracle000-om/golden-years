/**
 * USDA APHIS Inspection Adapter
 *
 * Downloads and parses breeder/dealer inspection data from the
 * Data Liberation Project's GitHub CSV (updated daily).
 *
 * Source: https://github.com/data-liberation-project/aphis-inspection-reports
 *
 * We filter to license types A (Breeder) and B (Dealer) — the upstream
 * supply side of the shelter system.
 */

const CSV_URL =
    'https://raw.githubusercontent.com/data-liberation-project/aphis-inspection-reports/main/data/combined/inspections.csv';

export interface AphisInspection {
    certNumber: string;
    licenseType: string;      // A, B
    legalName: string;
    siteName: string | null;
    city: string | null;
    state: string;
    zipCode: string | null;
    inspectionDate: Date;
    inspectionType: string | null;
    criticalViolations: number;
    nonCritical: number;
    animalCount: number | null;
}

/** Parse DD-MON-YYYY date format (e.g., "27-MAY-2014") */
function parsePdfDate(dateStr: string | undefined): Date | null {
    if (!dateStr || dateStr.length < 8) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/** Parse web_inspectionDate (YYYY-MM-DD) */
function parseWebDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Simple CSV parser that handles quoted fields with embedded commas/newlines.
 * Returns array of objects keyed by header names.
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
                i++; // skip escaped quote
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                currentField += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
                currentRow.push(currentField);
                currentField = '';
                if (currentRow.length > 1) rows.push(currentRow);
                currentRow = [];
                if (ch === '\r') i++; // skip \n after \r
            } else {
                currentField += ch;
            }
        }
    }
    // Last row
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.length > 1) rows.push(currentRow);
    }

    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(row => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = row[i] || '';
        }
        return obj;
    });
}

/**
 * Download and parse APHIS inspection CSV from GitHub.
 * Filters to breeder (A) and dealer (B) license types only.
 */
export async function fetchAphisInspections(): Promise<AphisInspection[]> {
    console.log(`   📥 Downloading APHIS inspections CSV from GitHub...`);

    const resp = await fetch(CSV_URL, {
        headers: { 'User-Agent': 'GoldenYearsClub/1.0 (aphis-integration)' },
        signal: AbortSignal.timeout(120_000), // large file, allow 2 min
    });

    if (!resp.ok) {
        throw new Error(`Failed to download APHIS CSV: ${resp.status} ${resp.statusText}`);
    }

    const csvText = await resp.text();
    console.log(`   📄 CSV downloaded (${(csvText.length / 1024 / 1024).toFixed(1)}MB)`);

    const records = parseCsv(csvText);
    console.log(`   📊 ${records.length} total inspection records parsed`);

    // Filter to breeders (A) and dealers (B)
    const filtered = records.filter(
        (r) => r.licenseType === 'A' || r.licenseType === 'B'
    );

    console.log(`   🐾 ${filtered.length} breeder/dealer inspections (A+B)`);

    const inspections: AphisInspection[] = [];

    for (const r of filtered) {
        const date = parseWebDate(r.web_inspectionDate) || parsePdfDate(r.pdf_date);
        if (!date) continue;

        const state = (r.customer_state || r.web_state || '').trim().toUpperCase();
        if (!state || state.length !== 2) continue;

        inspections.push({
            certNumber: (r.web_certNumber || '').trim(),
            licenseType: r.licenseType,
            legalName: (r.web_legalName || r.pdf_customer_name || '').trim(),
            siteName: (r.web_siteName || r.pdf_site_name || '').trim() || null,
            city: (r.web_city || '').trim() || null,
            state,
            zipCode: (r.web_zip || '').trim() || null,
            inspectionDate: date,
            inspectionType: (r.pdf_insp_type || '').trim() || null,
            criticalViolations: parseInt(r.web_critical || '0', 10) || 0,
            nonCritical: parseInt(r.web_nonCritical || '0', 10) || 0,
            animalCount: r.pdf_animals_total ? parseInt(r.pdf_animals_total, 10) || null : null,
        });
    }

    console.log(`   ✅ ${inspections.length} valid breeder/dealer inspections ready for DB`);
    return inspections;
}
