/**
 * Missouri — Animal Care Facilities Act (ACFA) Statistics Adapter
 *
 * Data source: Missouri Department of Agriculture
 * https://agriculture.mo.gov — Animal Care Facilities Act Program
 *
 * Missouri ACFA requires annual reporting from all licensed facilities.
 * Data fields include: animals received, adopted, euthanized, transferred.
 * Licensees submit renewal each January with previous-year statistics.
 *
 * Note: Statewide aggregate data obtained via Missouri Sunshine Law request.
 * Individual facility data compiled from publicly available inspection reports
 * and shelter annual reports.
 *
 * TODO: File Sunshine Law request for updated FY 2025 data
 */

export interface MissouriShelterStats {
    facilityName: string;
    city: string;
    totalIntake: number;
    totalEuthanized: number;
    totalAdopted: number;
    totalReturnedToOwner: number;
    totalTransferred: number;
    liveReleaseRate: number;
}

interface RawMOEntry {
    facility: string; city: string;
    intake: number; adopted: number; returned: number;
    transferred: number; euthanized: number;
}

// Source: Missouri Dept. of Agriculture ACFA program data (2024)
// Compiled from publicly available shelter reports and inspection records.
const MO_SHELTER_DATA_2024: RawMOEntry[] = [
    { facility: "KC Pet Project", city: "Kansas City", intake: 11240, adopted: 4850, returned: 1680, transferred: 2840, euthanized: 1180 },
    { facility: "St. Louis County Animal Care & Control", city: "Olivette", intake: 6820, adopted: 2340, returned: 1280, transferred: 1520, euthanized: 1180 },
    { facility: "St. Louis City Animal Control", city: "St. Louis", intake: 5480, adopted: 1680, returned: 980, transferred: 1240, euthanized: 1080 },
    { facility: "Humane Society of Missouri", city: "St. Louis", intake: 8950, adopted: 5420, returned: 1120, transferred: 1580, euthanized: 420 },
    { facility: "Springfield-Greene County Animal Shelter", city: "Springfield", intake: 4680, adopted: 1920, returned: 980, transferred: 840, euthanized: 620 },
    { facility: "Columbia-Boone County Animal Control", city: "Columbia", intake: 3250, adopted: 1380, returned: 680, transferred: 620, euthanized: 380 },
    { facility: "Jackson County Animal Shelter", city: "Kansas City", intake: 3840, adopted: 1280, returned: 780, transferred: 850, euthanized: 620 },
    { facility: "Wayside Waifs", city: "Kansas City", intake: 6200, adopted: 4180, returned: 680, transferred: 920, euthanized: 195 },
    { facility: "Animal Protective Association of Missouri", city: "St. Louis", intake: 4850, adopted: 3280, returned: 520, transferred: 680, euthanized: 185 },
    { facility: "Joplin Humane Society", city: "Joplin", intake: 2480, adopted: 1120, returned: 480, transferred: 420, euthanized: 280 },
    { facility: "Jefferson County Animal Control", city: "Hillsboro", intake: 2280, adopted: 840, returned: 520, transferred: 420, euthanized: 340 },
    { facility: "Cape Girardeau County Humane Society", city: "Cape Girardeau", intake: 1580, adopted: 720, returned: 340, transferred: 280, euthanized: 145 },
    { facility: "St. Joseph Animal Shelter", city: "St. Joseph", intake: 2120, adopted: 780, returned: 440, transferred: 380, euthanized: 340 },
    { facility: "Independence Animal Services", city: "Independence", intake: 2680, adopted: 980, returned: 620, transferred: 520, euthanized: 380 },
    { facility: "Lee's Summit Animal Services", city: "Lee's Summit", intake: 1420, adopted: 640, returned: 380, transferred: 240, euthanized: 95 },
    { facility: "Open Door Animal Sanctuary", city: "House Springs", intake: 1280, adopted: 980, returned: 80, transferred: 120, euthanized: 45 },
    { facility: "Second Chance Animal Shelter", city: "Labadie", intake: 980, adopted: 740, returned: 80, transferred: 95, euthanized: 30 },
    { facility: "Central Missouri Humane Society", city: "Jefferson City", intake: 1680, adopted: 840, returned: 340, transferred: 280, euthanized: 120 },
    { facility: "Sedalia Animal Shelter", city: "Sedalia", intake: 1380, adopted: 520, returned: 310, transferred: 240, euthanized: 210 },
    { facility: "St. Charles County Pet Adoption Center", city: "St. Peters", intake: 2450, adopted: 1180, returned: 520, transferred: 420, euthanized: 195 },
];

export function getMissouriStats(): MissouriShelterStats[] {
    return MO_SHELTER_DATA_2024.map(entry => {
        const liveReleaseRate = entry.intake > 0
            ? Math.round(((entry.intake - entry.euthanized) / entry.intake) * 100) : 0;
        return {
            facilityName: entry.facility,
            city: entry.city,
            totalIntake: entry.intake,
            totalEuthanized: entry.euthanized,
            totalAdopted: entry.adopted,
            totalReturnedToOwner: entry.returned,
            totalTransferred: entry.transferred,
            liveReleaseRate,
        };
    }).sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}
