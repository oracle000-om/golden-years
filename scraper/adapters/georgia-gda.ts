/**
 * Georgia GDA — Government Shelter Data Adapter
 *
 * Parses Georgia Department of Agriculture's shelter data export (XLSX).
 * Georgia mandates all government-run shelters report monthly.
 * Data source: https://agr.georgia.gov/government-shelter-data-reporting
 *
 * Columns (per row = 1 month for 1 shelter):
 *   Intake: stray, relinquished, owner-intended-euth, transferred-in, other
 *   Outcome: adoption, returned-to-owner, transferred-out, returned-to-field,
 *            other-live, died-in-care, lost-in-care, shelter-euthanasia, owner-intended-euth
 *   All split into Canine/Feline.
 */

import * as XLSX from 'xlsx';

export interface GeorgiaShelterStats {
    licenseNumber: string;
    shelterName: string;
    year: number;
    monthsReported: number;
    /** Total intake (dogs + cats) — stray + relinquished + transferred in + other (excludes owner-intended-euth) */
    totalIntake: number;
    /** Total shelter euthanasia (dogs + cats) — excludes owner-intended-euthanasia */
    totalEuthanized: number;
    /** Total adopted */
    totalAdopted: number;
    /** Total returned to owner */
    totalReclaimed: number;
    /** Total transferred out */
    totalTransferred: number;
    /** Died in care + lost in care */
    totalDied: number;
    /** Live release rate */
    liveReleaseRate: number;
    dogs: { intake: number; euthanized: number; adopted: number };
    cats: { intake: number; euthanized: number; adopted: number };
    county: string;
}

/** Excel serial date to JS Date */
function excelDateToYear(serial: number): number {
    // Excel serial 44013 = July 1, 2020
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    return date.getFullYear();
}

/**
 * Parse the Georgia GDA XLSX export and aggregate by shelter + year
 */
export function parseGeorgiaExport(filePath: string, targetYear?: number): GeorgiaShelterStats[] {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    // Find header row
    const headerIdx = data.findIndex(r => r.some(c => String(c || '').includes('Shelter Name')));
    if (headerIdx === -1) throw new Error('Could not find header row in XLSX');

    const rows = data.slice(headerIdx + 1).filter(r => r[4]); // shelter name = col 4

    // Column indices (from parsing):
    // 1: Report Period Start, 3: License Number, 4: Shelter Name
    // Intake: 7=canine stray, 8=feline stray, 9=canine relinq, 10=feline relinq,
    //         14=canine transfer-in, 15=feline transfer-in, 16=canine other, 17=feline other
    // Outcome: 18=canine adopt, 19=feline adopt, 20=canine RTO, 21=feline RTO,
    //          22=canine transfer-out, 23=feline transfer-out,
    //          28=canine died, 29=feline died, 30=canine lost, 31=feline lost,
    //          32=canine shelter euth, 33=feline shelter euth

    // Aggregate by shelter + year
    const agg = new Map<string, GeorgiaShelterStats>();

    for (const r of rows) {
        const dateSerial = r[1];
        if (!dateSerial || typeof dateSerial !== 'number') continue;
        const year = excelDateToYear(dateSerial);

        if (targetYear && year !== targetYear) continue;

        const license = String(r[3] || '');
        const name = String(r[4] || '');
        const key = `${license}-${year}`;

        const n = (idx: number) => Number(r[idx]) || 0;

        if (!agg.has(key)) {
            agg.set(key, {
                licenseNumber: license,
                shelterName: name,
                year,
                monthsReported: 0,
                totalIntake: 0,
                totalEuthanized: 0,
                totalAdopted: 0,
                totalReclaimed: 0,
                totalTransferred: 0,
                totalDied: 0,
                liveReleaseRate: 0,
                dogs: { intake: 0, euthanized: 0, adopted: 0 },
                cats: { intake: 0, euthanized: 0, adopted: 0 },
                county: extractCounty(name),
            });
        }

        const s = agg.get(key)!;
        s.monthsReported++;

        // Dog intake
        const dogIntake = n(7) + n(9) + n(14) + n(16);
        // Cat intake
        const catIntake = n(8) + n(10) + n(15) + n(17);
        s.dogs.intake += dogIntake;
        s.cats.intake += catIntake;
        s.totalIntake += dogIntake + catIntake;

        // Dog shelter euthanasia
        s.dogs.euthanized += n(32);
        s.cats.euthanized += n(33);
        s.totalEuthanized += n(32) + n(33);

        // Adopted
        s.dogs.adopted += n(18);
        s.cats.adopted += n(19);
        s.totalAdopted += n(18) + n(19);

        // RTO
        s.totalReclaimed += n(20) + n(21);

        // Transferred out
        s.totalTransferred += n(22) + n(23);

        // Died + lost
        s.totalDied += n(28) + n(29) + n(30) + n(31);
    }

    // Calculate LRR and collect results
    const results: GeorgiaShelterStats[] = [];
    for (const s of agg.values()) {
        if (s.totalIntake > 0) {
            s.liveReleaseRate = Math.round(
                ((s.totalIntake - s.totalEuthanized - s.totalDied) / s.totalIntake) * 100
            );
        }
        results.push(s);
    }

    return results.sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}

/** Extract county from shelter name (e.g., "Fulton County Animal Services" → "Fulton") */
function extractCounty(name: string): string {
    const match = name.match(/^(.+?)\s+County\b/i);
    if (match) return match[1].trim();
    // Try "City of X" pattern
    const cityMatch = name.match(/\bCity\s+of\s+(.+?)(?:\s+Animal|$)/i);
    if (cityMatch) return cityMatch[1].trim();
    return '';
}
