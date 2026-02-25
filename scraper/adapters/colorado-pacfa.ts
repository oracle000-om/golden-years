/**
 * Colorado PACFA — Animal Shelter & Rescue Statistics Adapter
 *
 * Parses Colorado Dept. of Agriculture's PACFA annual statistics (XLSX).
 * Data source: Google Sheet published by CO PACFA, downloadable as XLSX.
 *
 * Column layout (154 cols): Facility Name, then 17-column groups for each
 * species category: Adult Dogs, Juvenile Dogs, Adult Cats, Juvenile Cats,
 * Birds, Small Mammals, Reptiles & Amphibians, Rabbits, Other.
 *
 * Each 17-column group:
 *   0: In Shelter (start), 1: In Foster (start),
 *   2: Stray, 3: Owner Relinquished, 4: Transfer In CO, 5: Transfer In OOS, 6: Other (intake),
 *   7: Adoption, 8: RTO, 9: Transfer Out CO, 10: Transfer Out OOS, 11: Other (outcome),
 *   12: Deaths, 13: Euthanasia, 14: Missing/Stolen,
 *   15: In Shelter (end), 16: In Foster (end)
 */

import * as XLSX from 'xlsx';

export interface ColoradoShelterStats {
    facilityName: string;
    totalIntake: number;
    totalEuthanized: number;
    totalAdopted: number;
    totalReclaimed: number;
    totalTransferred: number;
    totalDied: number;
    liveReleaseRate: number;
    dogs: { intake: number; euthanized: number; adopted: number };
    cats: { intake: number; euthanized: number; adopted: number };
}

/** Column offsets within each 17-column species group (relative to group start) */
const COL = {
    STRAY: 2,
    OWNER_RELINQUISHED: 3,
    TRANSFER_IN_CO: 4,
    TRANSFER_IN_OOS: 5,
    OTHER_INTAKE: 6,
    ADOPTION: 7,
    RTO: 8,
    TRANSFER_OUT_CO: 9,
    TRANSFER_OUT_OOS: 10,
    OTHER_OUTCOME: 11,
    DEATHS: 12,
    EUTHANASIA: 13,
    MISSING: 14,
};

/** Species group start columns (0-indexed, col 0 = Facility Name) */
const GROUPS = {
    ADULT_DOGS: 1,
    JUVENILE_DOGS: 18,
    ADULT_CATS: 35,
    JUVENILE_CATS: 52,
};

/**
 * Parse the Colorado PACFA XLSX export
 */
export function parseColoradoExport(filePath: string): ColoradoShelterStats[] {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

    if (data.length < 2) throw new Error('No data rows found in XLSX');

    const results: ColoradoShelterStats[] = [];

    const n = (row: any[], idx: number) => Number(row[idx]) || 0;

    const sumIntake = (row: any[], groupStart: number): number =>
        n(row, groupStart + COL.STRAY) +
        n(row, groupStart + COL.OWNER_RELINQUISHED) +
        n(row, groupStart + COL.TRANSFER_IN_CO) +
        n(row, groupStart + COL.TRANSFER_IN_OOS) +
        n(row, groupStart + COL.OTHER_INTAKE);

    const sumEuth = (row: any[], groupStart: number): number =>
        n(row, groupStart + COL.EUTHANASIA);

    const sumAdopt = (row: any[], groupStart: number): number =>
        n(row, groupStart + COL.ADOPTION);

    const sumRTO = (row: any[], groupStart: number): number =>
        n(row, groupStart + COL.RTO);

    const sumTransferOut = (row: any[], groupStart: number): number =>
        n(row, groupStart + COL.TRANSFER_OUT_CO) +
        n(row, groupStart + COL.TRANSFER_OUT_OOS);

    const sumDeaths = (row: any[], groupStart: number): number =>
        n(row, groupStart + COL.DEATHS);

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const name = String(row[0] || '').trim();
        if (!name) continue;

        const dogIntake = sumIntake(row, GROUPS.ADULT_DOGS) + sumIntake(row, GROUPS.JUVENILE_DOGS);
        const dogEuth = sumEuth(row, GROUPS.ADULT_DOGS) + sumEuth(row, GROUPS.JUVENILE_DOGS);
        const dogAdopt = sumAdopt(row, GROUPS.ADULT_DOGS) + sumAdopt(row, GROUPS.JUVENILE_DOGS);

        const catIntake = sumIntake(row, GROUPS.ADULT_CATS) + sumIntake(row, GROUPS.JUVENILE_CATS);
        const catEuth = sumEuth(row, GROUPS.ADULT_CATS) + sumEuth(row, GROUPS.JUVENILE_CATS);
        const catAdopt = sumAdopt(row, GROUPS.ADULT_CATS) + sumAdopt(row, GROUPS.JUVENILE_CATS);

        const totalIntake = dogIntake + catIntake;
        const totalEuthanized = dogEuth + catEuth;
        const totalAdopted = dogAdopt + catAdopt;

        const totalReclaimed =
            sumRTO(row, GROUPS.ADULT_DOGS) + sumRTO(row, GROUPS.JUVENILE_DOGS) +
            sumRTO(row, GROUPS.ADULT_CATS) + sumRTO(row, GROUPS.JUVENILE_CATS);

        const totalTransferred =
            sumTransferOut(row, GROUPS.ADULT_DOGS) + sumTransferOut(row, GROUPS.JUVENILE_DOGS) +
            sumTransferOut(row, GROUPS.ADULT_CATS) + sumTransferOut(row, GROUPS.JUVENILE_CATS);

        const totalDied =
            sumDeaths(row, GROUPS.ADULT_DOGS) + sumDeaths(row, GROUPS.JUVENILE_DOGS) +
            sumDeaths(row, GROUPS.ADULT_CATS) + sumDeaths(row, GROUPS.JUVENILE_CATS);

        const liveReleaseRate = totalIntake > 0
            ? Math.round(((totalIntake - totalEuthanized - totalDied) / totalIntake) * 100)
            : 0;

        results.push({
            facilityName: name,
            totalIntake,
            totalEuthanized,
            totalAdopted,
            totalReclaimed,
            totalTransferred,
            totalDied,
            liveReleaseRate,
            dogs: { intake: dogIntake, euthanized: dogEuth, adopted: dogAdopt },
            cats: { intake: catIntake, euthanized: catEuth, adopted: catAdopt },
        });
    }

    return results.sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}
