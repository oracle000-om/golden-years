/**
 * Lab Animal Retirement / Beagle Bill Adapter
 *
 * Tracks which US states have "Beagle Bills" — laws mandating
 * research labs offer animals for adoption before euthanasia.
 *
 * Also tracks lab animal adoption organizations for cross-referencing
 * with our shelter listings.
 *
 * Sources:
 * - State legislature tracking
 * - Beagle Freedom Project data
 * - Rise for Animals analyzed USDA data
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

export interface BeagleBillState {
    state: string;              // 2-letter code
    hasBeagleBill: boolean;
    billYear: number | null;    // year enacted
    details: string | null;     // scope/provisions
}

interface SeedEntry {
    state: string;
    has_beagle_bill: boolean;
    bill_year?: number;
    details?: string;
}

// Known Beagle Bill states as of 2024
// Source: compiled from state legislature records
const KNOWN_BEAGLE_BILL_STATES: BeagleBillState[] = [
    { state: 'CA', hasBeagleBill: true, billYear: 2016, details: 'SB 1436 — Requires public/private research facilities to offer dogs and cats for adoption' },
    { state: 'CT', hasBeagleBill: true, billYear: 2016, details: 'Public Act 16-145 — Labs must offer animals to rescue organizations' },
    { state: 'IL', hasBeagleBill: true, billYear: 2019, details: 'SB 241 — Research facilities must offer dogs and cats for adoption' },
    { state: 'MD', hasBeagleBill: true, billYear: 2018, details: 'HB 315 — Labs must adopt out cats and dogs no longer needed' },
    { state: 'MN', hasBeagleBill: true, billYear: 2019, details: 'HF 2255 — Post-research adoption program mandate' },
    { state: 'NV', hasBeagleBill: true, billYear: 2017, details: 'AB 286 — Testing facilities must offer animals for adoption' },
    { state: 'NJ', hasBeagleBill: true, billYear: 2020, details: 'A1809 — Requires research institutions to adopt out animals' },
    { state: 'NY', hasBeagleBill: true, billYear: 2019, details: 'S5765 — Research animal adoption mandate' },
    { state: 'RI', hasBeagleBill: true, billYear: 2018, details: 'H 7152 — Labs must offer dogs and cats to shelters or rescues' },
    { state: 'VA', hasBeagleBill: true, billYear: 2020, details: 'HB 1552 — Research lab adoption or euthanasia disclosure' },
    { state: 'WA', hasBeagleBill: true, billYear: 2020, details: 'SB 6300 — Requires post-research adoption programs' },
    { state: 'DE', hasBeagleBill: true, billYear: 2020, details: 'HB 380 — Research animal adoption act' },
];

/**
 * Load Beagle Bill data from built-in records + optional seed file overrides.
 */
export async function fetchBeagleBillStates(): Promise<BeagleBillState[]> {
    console.log(`   📥 Loading Beagle Bill state data...`);

    // Start with known data
    const stateMap = new Map<string, BeagleBillState>();
    for (const entry of KNOWN_BEAGLE_BILL_STATES) {
        stateMap.set(entry.state, entry);
    }

    // Try to load seed overrides
    const filePath = join(__dirname, '..', '..', 'data', 'beagle-bills.json');
    try {
        const raw = await readFile(filePath, 'utf-8');
        const seeds: SeedEntry[] = JSON.parse(raw);

        for (const s of seeds) {
            const state = s.state.trim().toUpperCase();
            if (state.length !== 2) continue;

            stateMap.set(state, {
                state,
                hasBeagleBill: s.has_beagle_bill,
                billYear: s.bill_year || null,
                details: s.details?.trim() || null,
            });
        }
        console.log(`   📄 Loaded ${seeds.length} seed overrides from ${filePath}`);
    } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
    }

    const entries = Array.from(stateMap.values());
    const withBill = entries.filter(e => e.hasBeagleBill);

    console.log(`   ✅ ${withBill.length} states with Beagle Bills tracked`);
    return entries;
}
