/**
 * North Carolina NCDA&CS — Public Animal Shelter Report Adapter
 *
 * Parses North Carolina Department of Agriculture's annual shelter report (XLSX).
 * Columns: CALENDAR YEAR, LIC #, COUNTY, FACILITY NAME, SPECIES,
 *          INTAKE, ADOPTED OUT, RETURNED TO OWNER, EUTHANIZED,
 *          TOTAL OPERATING EXPENSES, COST PER ANIMAL
 *
 * Each row = one species at one facility. Aggregate DOG + CAT per facility.
 */

import * as XLSX from 'xlsx';

export interface NorthCarolinaShelterStats {
    licenseNumber: number;
    facilityName: string;
    county: string;
    year: number;
    totalIntake: number;
    totalEuthanized: number;
    totalAdopted: number;
    totalReclaimed: number;
    liveReleaseRate: number;
    dogs: { intake: number; euthanized: number; adopted: number };
    cats: { intake: number; euthanized: number; adopted: number };
}

export function parseNorthCarolinaExport(filePath: string, targetYear?: number): NorthCarolinaShelterStats[] {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    if (data.length < 2) throw new Error('No data rows found in XLSX');

    const agg = new Map<string, NorthCarolinaShelterStats>();
    const n = (val: any) => Number(val) || 0;

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[3]) continue;

        const year = n(row[0]);
        if (targetYear && year !== targetYear) continue;

        const license = n(row[1]);
        const county = String(row[2] || '').trim();
        const name = String(row[3] || '').trim();
        const species = String(row[4] || '').toUpperCase();
        if (!name) continue;

        const key = `${license}-${year}`;
        if (!agg.has(key)) {
            agg.set(key, {
                licenseNumber: license, facilityName: name, county, year,
                totalIntake: 0, totalEuthanized: 0, totalAdopted: 0, totalReclaimed: 0,
                liveReleaseRate: 0,
                dogs: { intake: 0, euthanized: 0, adopted: 0 },
                cats: { intake: 0, euthanized: 0, adopted: 0 },
            });
        }

        const s = agg.get(key)!;
        const intake = n(row[5]), adopted = n(row[6]), rto = n(row[7]), euthanized = n(row[8]);

        if (species === 'DOG') { s.dogs.intake += intake; s.dogs.euthanized += euthanized; s.dogs.adopted += adopted; }
        else if (species === 'CAT') { s.cats.intake += intake; s.cats.euthanized += euthanized; s.cats.adopted += adopted; }

        s.totalIntake += intake;
        s.totalEuthanized += euthanized;
        s.totalAdopted += adopted;
        s.totalReclaimed += rto;
    }

    const results: NorthCarolinaShelterStats[] = [];
    for (const s of agg.values()) {
        if (s.totalIntake > 0) {
            s.liveReleaseRate = Math.round(((s.totalIntake - s.totalEuthanized) / s.totalIntake) * 100);
        }
        results.push(s);
    }
    return results.sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}
