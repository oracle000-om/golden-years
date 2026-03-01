/**
 * Horrible Hundred Adapter
 *
 * Reads curated JSON seed data extracted from the Humane Society's
 * annual "Horrible Hundred" report. The source PDF is manually
 * processed into a structured JSON file.
 *
 * The Horrible Hundred identifies ~100 of the worst puppy mills in
 * the US based on:
 * - Repeat USDA violations
 * - State inspection failures
 * - Consumer complaints
 * - Investigative reporting
 *
 * Source: https://www.humaneworld.org/en/horrible-hundred
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

export interface HorribleHundredEntry {
    certNumber: string | null;   // USDA license if known
    facilityName: string;
    state: string;               // 2-letter code
    city: string | null;
    reportYear: number;
    yearsOnList: number;
    narrative: string | null;
    violationTypes: string[];
}

interface SeedEntry {
    cert_number?: string;
    facility_name: string;
    state: string;
    city?: string;
    report_year: number;
    years_on_list?: number;
    narrative?: string;
    violation_types?: string[];
}

/**
 * Load and validate Horrible Hundred entries from a JSON seed file.
 *
 * @param year Report year to load (looks for data/horrible-hundred-{year}.json)
 */
export async function fetchHorribleHundred(year: number = 2024): Promise<HorribleHundredEntry[]> {
    const filePath = join(__dirname, '..', '..', 'data', `horrible-hundred-${year}.json`);

    console.log(`   📥 Loading Horrible Hundred ${year} seed data from ${filePath}...`);

    let rawData: string;
    try {
        rawData = await readFile(filePath, 'utf-8');
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`   ⚠️  Seed file not found: ${filePath}`);
            console.log(`   ℹ️  To populate, create ${filePath} with extracted report data.`);
            return [];
        }
        throw err;
    }

    const seeds: SeedEntry[] = JSON.parse(rawData);
    console.log(`   📄 Loaded ${seeds.length} raw entries`);

    // Validate and normalize
    const entries: HorribleHundredEntry[] = [];
    let skipped = 0;

    for (const s of seeds) {
        if (!s.facility_name || !s.state) {
            skipped++;
            continue;
        }

        const state = s.state.trim().toUpperCase();
        if (state.length !== 2) {
            skipped++;
            continue;
        }

        entries.push({
            certNumber: s.cert_number?.trim() || null,
            facilityName: s.facility_name.trim(),
            state,
            city: s.city?.trim() || null,
            reportYear: s.report_year || year,
            yearsOnList: s.years_on_list || 1,
            narrative: s.narrative?.trim() || null,
            violationTypes: (s.violation_types || []).map(v => v.trim()).filter(Boolean),
        });
    }

    if (skipped > 0) {
        console.log(`   ⚠️  Skipped ${skipped} invalid entries`);
    }

    console.log(`   ✅ ${entries.length} valid Horrible Hundred entries ready for DB`);
    return entries;
}
