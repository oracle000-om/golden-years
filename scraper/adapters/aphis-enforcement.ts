/**
 * USDA APHIS Enforcement Actions Adapter
 *
 * Downloads and aggregates citation data from the Data Liberation Project's
 * inspections-citations.csv to build enforcement action records.
 *
 * Source: https://github.com/data-liberation-project/aphis-inspection-reports
 *
 * This adapter identifies breeders with patterns of serious violations:
 * - Repeat critical citations across inspections
 * - Direct/serious citations that indicate enforcement action
 * - Citation codes that map to fines, suspensions, or revocations
 */

const CITATIONS_CSV_URL =
    'https://raw.githubusercontent.com/data-liberation-project/aphis-inspection-reports/main/data/combined/inspections-citations.csv';

const INSPECTIONS_CSV_URL =
    'https://raw.githubusercontent.com/data-liberation-project/aphis-inspection-reports/main/data/combined/inspections.csv';

export interface EnforcementAction {
    certNumber: string;
    legalName: string;
    state: string;
    actionType: 'FINE' | 'SUSPENSION' | 'REVOCATION' | 'WARNING';
    actionDate: Date;
    fineAmount: number | null;      // in cents
    citationCodes: string[];
    narrative: string | null;
}

/** Citation severity classification */
interface Citation {
    hashId: string;
    code: string;
    desc: string;
    kind: string;       // 'Critical' | 'Non-Critical' | 'Direct' | etc.
    repeat: boolean;
    narrative: string | null;
}

/** Breeder lookup from inspections CSV */
interface BreederInfo {
    certNumber: string;
    legalName: string;
    state: string;
    inspectionDate: Date;
}

/**
 * Simple CSV parser (shared logic with aphis-inspections adapter).
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
                currentRow.push(currentField);
                currentField = '';
            } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
                currentRow.push(currentField);
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
 * Classify enforcement action type based on citation patterns.
 *
 * - REVOCATION: license revoked (rare, most severe)
 * - SUSPENSION: license suspended
 * - FINE: monetary penalty (repeat critical violations)
 * - WARNING: first-time critical or recurring non-critical
 */
function classifyAction(citations: Citation[]): 'FINE' | 'SUSPENSION' | 'REVOCATION' | 'WARNING' {
    const hasDirect = citations.some(c => c.kind.toLowerCase() === 'direct');
    const criticalCount = citations.filter(c => c.kind.toLowerCase() === 'critical').length;
    const repeatCount = citations.filter(c => c.repeat).length;

    if (hasDirect) return 'FINE';
    if (criticalCount >= 3 && repeatCount >= 2) return 'SUSPENSION';
    if (criticalCount >= 2 || repeatCount >= 1) return 'FINE';
    return 'WARNING';
}

/**
 * Build a condensed narrative from citation descriptions.
 */
function buildNarrative(citations: Citation[]): string | null {
    const parts = citations
        .filter(c => c.desc || c.narrative)
        .map(c => {
            const prefix = c.repeat ? '[REPEAT] ' : '';
            const severity = c.kind ? `[${c.kind}] ` : '';
            return `${prefix}${severity}${c.code}: ${c.desc || ''}`.trim();
        });

    if (parts.length === 0) return null;
    return parts.slice(0, 5).join(' | ');  // cap at 5 for readability
}

/**
 * Download and aggregate APHIS citation data into enforcement actions.
 *
 * Groups citations by breeder (certNumber) + inspection date to identify
 * enforcement-worthy patterns. Only creates actions for inspections with
 * critical or direct citations.
 */
export async function fetchAphisEnforcement(): Promise<EnforcementAction[]> {
    console.log(`   📥 Downloading APHIS citations CSV from GitHub...`);

    // Download citations
    const citResp = await fetch(CITATIONS_CSV_URL, {
        headers: { 'User-Agent': 'GoldenYearsClub/1.0 (enforcement-integration)' },
        signal: AbortSignal.timeout(120_000),
    });
    if (!citResp.ok) {
        throw new Error(`Failed to download citations CSV: ${citResp.status} ${citResp.statusText}`);
    }
    const citCsv = await citResp.text();
    console.log(`   📄 Citations CSV downloaded (${(citCsv.length / 1024 / 1024).toFixed(1)}MB)`);

    // Download inspections (for breeder metadata lookup)
    console.log(`   📥 Downloading APHIS inspections CSV for breeder lookup...`);
    const inspResp = await fetch(INSPECTIONS_CSV_URL, {
        headers: { 'User-Agent': 'GoldenYearsClub/1.0 (enforcement-integration)' },
        signal: AbortSignal.timeout(120_000),
    });
    if (!inspResp.ok) {
        throw new Error(`Failed to download inspections CSV: ${inspResp.status} ${inspResp.statusText}`);
    }
    const inspCsv = await inspResp.text();
    console.log(`   📄 Inspections CSV downloaded (${(inspCsv.length / 1024 / 1024).toFixed(1)}MB)`);

    // Parse both CSVs
    const citRecords = parseCsv(citCsv);
    console.log(`   📊 ${citRecords.length} total citation records parsed`);

    const inspRecords = parseCsv(inspCsv);

    // Build breeder lookup by hash_id
    const breederByHash = new Map<string, BreederInfo>();
    for (const r of inspRecords) {
        const lt = r.licenseType || '';
        if (lt !== 'A' && lt !== 'B') continue;  // breeders/dealers only

        const certNumber = (r.web_certNumber || '').trim();
        const state = (r.customer_state || r.web_state || '').trim().toUpperCase();
        if (!certNumber || !state || state.length !== 2) continue;

        const dateStr = r.web_inspectionDate || r.pdf_date;
        if (!dateStr) continue;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) continue;

        breederByHash.set(r.hash_id || '', {
            certNumber,
            legalName: (r.web_legalName || r.pdf_customer_name || '').trim(),
            state,
            inspectionDate: date,
        });
    }

    console.log(`   🔍 ${breederByHash.size} breeder inspection records indexed`);

    // Group citations by hash_id (inspection)
    const citationsByInspection = new Map<string, Citation[]>();
    for (const c of citRecords) {
        const hashId = c.hash_id || '';
        if (!hashId) continue;
        if (!breederByHash.has(hashId)) continue;  // skip non-breeder inspections

        const citation: Citation = {
            hashId,
            code: (c.code || '').trim(),
            desc: (c.desc || '').trim(),
            kind: (c.kind || '').trim(),
            repeat: (c.repeat || '').toLowerCase() === 'true' || c.repeat === '1',
            narrative: (c.narrative || '').trim() || null,
        };

        const existing = citationsByInspection.get(hashId) || [];
        existing.push(citation);
        citationsByInspection.set(hashId, existing);
    }

    console.log(`   📊 ${citationsByInspection.size} inspections with citations`);

    // Build enforcement actions from inspections with critical/direct citations
    const actions: EnforcementAction[] = [];

    for (const [hashId, citations] of citationsByInspection) {
        const breeder = breederByHash.get(hashId);
        if (!breeder) continue;

        // Only create enforcement records for significant violations
        const hasCritical = citations.some(c =>
            c.kind.toLowerCase() === 'critical' || c.kind.toLowerCase() === 'direct'
        );
        if (!hasCritical) continue;

        const actionType = classifyAction(citations);
        const narrative = buildNarrative(citations);
        const codes = [...new Set(citations.map(c => c.code).filter(Boolean))];

        actions.push({
            certNumber: breeder.certNumber,
            legalName: breeder.legalName,
            state: breeder.state,
            actionType,
            actionDate: breeder.inspectionDate,
            fineAmount: null,  // Not available in public data
            citationCodes: codes,
            narrative,
        });
    }

    console.log(`   ✅ ${actions.length} enforcement actions identified`);
    return actions;
}
