/**
 * Michigan MDARD — Animal Shelter Annual Report Adapter
 *
 * Parses Michigan shelter data from a manually extracted CSV/XLSX file.
 * Source is a 22MB compiled PDF of individual AI-034 forms.
 * Data source: https://www.michigan.gov/mdard/animals/animal-shelters/annual-reports
 */

import * as XLSX from 'xlsx';

export interface MichiganShelterStats {
    shelterName: string;
    registrationNumber: string;
    city: string;
    zipCode: string;
    totalIntake: number;
    totalEuthanized: number;
    totalAdopted: number;
    totalReclaimed: number;
    totalTransferred: number;
    liveReleaseRate: number;
    dogs: { intake: number; euthanized: number; adopted: number };
    cats: { intake: number; euthanized: number; adopted: number };
}

export function parseMichiganExport(filePath: string): MichiganShelterStats[] {
    const wb = XLSX.readFile(filePath);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, any>[];
    if (data.length === 0) throw new Error('No data rows found');

    const n = (row: Record<string, any>, ...keys: string[]): number => {
        for (const k of keys) for (const col of Object.keys(row))
            if (col.toLowerCase().includes(k.toLowerCase())) return Number(row[col]) || 0;
        return 0;
    };
    const s = (row: Record<string, any>, ...keys: string[]): string => {
        for (const k of keys) for (const col of Object.keys(row))
            if (col.toLowerCase().includes(k.toLowerCase())) return String(row[col] || '').trim();
        return '';
    };

    const results: MichiganShelterStats[] = [];
    for (const row of data) {
        const name = s(row, 'shelter name', 'facility', 'name');
        if (!name) continue;
        const dogIntake = n(row, 'dog stray', 'dogs stray') + n(row, 'dog owner', 'dogs owner') + n(row, 'dog transfer in', 'dogs transfer in') || n(row, 'dog intake', 'dogs intake');
        const catIntake = n(row, 'cat stray', 'cats stray') + n(row, 'cat owner', 'cats owner') + n(row, 'cat transfer in', 'cats transfer in') || n(row, 'cat intake', 'cats intake');
        const dogEuth = n(row, 'dog euth', 'dogs euth');
        const catEuth = n(row, 'cat euth', 'cats euth');
        const totalIntake = dogIntake + catIntake;
        const totalEuthanized = dogEuth + catEuth;
        const liveReleaseRate = totalIntake > 0 ? Math.round(((totalIntake - totalEuthanized) / totalIntake) * 100) : 0;
        results.push({
            shelterName: name, registrationNumber: s(row, 'registration', 'reg num', 'license'),
            city: s(row, 'city'), zipCode: s(row, 'zip'),
            totalIntake, totalEuthanized,
            totalAdopted: n(row, 'dog adopt', 'dogs adopt') + n(row, 'cat adopt', 'cats adopt'),
            totalReclaimed: n(row, 'dog rto', 'dogs rto') + n(row, 'cat rto', 'cats rto'),
            totalTransferred: n(row, 'dog transfer out', 'dogs transfer out') + n(row, 'cat transfer out', 'cats transfer out'),
            liveReleaseRate,
            dogs: { intake: dogIntake, euthanized: dogEuth, adopted: n(row, 'dog adopt', 'dogs adopt') },
            cats: { intake: catIntake, euthanized: catEuth, adopted: n(row, 'cat adopt', 'cats adopt') },
        });
    }
    return results.sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}
