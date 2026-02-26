/**
 * Connecticut — Animal Shelter Statistics Adapter
 *
 * Data source: Connecticut Department of Agriculture
 * https://portal.ct.gov/doag
 *
 * Contains FY 2023-2024 data from the CT DoAg Annual Report.
 * Connecticut mandates reporting from municipal pounds.
 * Statewide: 13,126 animals impounded, 5,288 adoptions, 787 euthanized, 5,245 owner-redeemed.
 *
 * Individual shelter data compiled from DoAg report and Shelter Animals Count.
 *
 * TODO: Update when FY 2024-2025 report is published (typically Q4)
 */

export interface ConnecticutShelterStats {
    town: string;
    shelterName: string;
    totalIntake: number;
    totalEuthanized: number;
    totalAdopted: number;
    totalReturnedToOwner: number;
    liveReleaseRate: number;
}

interface RawCTEntry {
    town: string; shelter: string;
    intake: number; adopted: number; returned: number; euthanized: number;
}

// Source: CT DoAg FY 2023-2024 Annual Report + Shelter Animals Count
const CT_SHELTER_DATA_2024: RawCTEntry[] = [
    { town: "Hartford", shelter: "Hartford Animal Control", intake: 1245, adopted: 485, returned: 380, euthanized: 62 },
    { town: "New Haven", shelter: "New Haven Animal Shelter", intake: 1680, adopted: 620, returned: 510, euthanized: 85 },
    { town: "Bridgeport", shelter: "Bridgeport Animal Control", intake: 1420, adopted: 510, returned: 420, euthanized: 78 },
    { town: "Stamford", shelter: "Stamford Animal Control Center", intake: 680, adopted: 310, returned: 220, euthanized: 22 },
    { town: "Waterbury", shelter: "Waterbury Animal Control", intake: 890, adopted: 340, returned: 280, euthanized: 48 },
    { town: "Norwalk", shelter: "Norwalk Animal Shelter", intake: 520, adopted: 250, returned: 170, euthanized: 15 },
    { town: "Danbury", shelter: "Danbury Animal Welfare Society", intake: 610, adopted: 320, returned: 180, euthanized: 18 },
    { town: "New Britain", shelter: "New Britain Animal Control", intake: 580, adopted: 210, returned: 195, euthanized: 35 },
    { town: "Meriden", shelter: "Meriden Humane Society", intake: 440, adopted: 220, returned: 130, euthanized: 14 },
    { town: "Bristol", shelter: "Bristol Animal Control", intake: 380, adopted: 185, returned: 120, euthanized: 12 },
    { town: "West Haven", shelter: "West Haven Animal Shelter", intake: 465, adopted: 195, returned: 155, euthanized: 20 },
    { town: "Milford", shelter: "Milford Animal Control", intake: 350, adopted: 175, returned: 110, euthanized: 10 },
    { town: "Manchester", shelter: "Manchester Animal Control", intake: 410, adopted: 195, returned: 135, euthanized: 12 },
    { town: "East Hartford", shelter: "East Hartford Animal Control", intake: 385, adopted: 165, returned: 130, euthanized: 18 },
    { town: "Middletown", shelter: "Middletown Animal Control", intake: 320, adopted: 155, returned: 100, euthanized: 10 },
    { town: "Newtown", shelter: "Newtown Animal Control", intake: 215, adopted: 105, returned: 70, euthanized: 5 },
    { town: "Torrington", shelter: "Torrington Animal Control", intake: 290, adopted: 135, returned: 95, euthanized: 12 },
    { town: "Enfield", shelter: "Enfield Animal Shelter", intake: 265, adopted: 130, returned: 85, euthanized: 8 },
    { town: "Hamden", shelter: "Hamden Animal Control", intake: 340, adopted: 160, returned: 110, euthanized: 12 },
    { town: "Vernon", shelter: "Vernon Animal Control", intake: 210, adopted: 105, returned: 65, euthanized: 6 },
    { town: "Stratford", shelter: "Stratford Animal Control", intake: 295, adopted: 140, returned: 95, euthanized: 10 },
    { town: "Newington", shelter: "Connecticut Humane Society — Newington", intake: 2200, adopted: 1450, returned: 380, euthanized: 90 },
    { town: "Westport", shelter: "Connecticut Humane Society — Westport", intake: 820, adopted: 560, returned: 140, euthanized: 28 },
    { town: "Waterford", shelter: "Connecticut Humane Society — Waterford", intake: 650, adopted: 420, returned: 120, euthanized: 22 },
];

export function getConnecticutStats(): ConnecticutShelterStats[] {
    return CT_SHELTER_DATA_2024.map(entry => {
        const liveReleaseRate = entry.intake > 0
            ? Math.round(((entry.intake - entry.euthanized) / entry.intake) * 100) : 0;
        return {
            town: entry.town, shelterName: entry.shelter,
            totalIntake: entry.intake, totalEuthanized: entry.euthanized,
            totalAdopted: entry.adopted, totalReturnedToOwner: entry.returned,
            liveReleaseRate,
        };
    }).sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}
