/**
 * New Jersey NJDOH — Annual Shelter/Pound Intake & Disposition Adapter
 *
 * Data source: https://www.nj.gov/health/vph/
 * Contains 2024 data extracted from the official PDF report.
 * 54 facilities reported across 21 counties.
 */

export interface NewJerseyShelterStats {
    county: string;
    shelterName: string;
    totalIntake: number;
    totalEuthanized: number;
    totalAdopted: number;
    totalRedeemed: number;
    liveReleaseRate: number;
    dogs: { intake: number; euthanized: number; adopted: number };
    cats: { intake: number; euthanized: number; adopted: number };
}

interface RawNJEntry {
    county: string; shelter: string;
    dogsImpounded: number; dogsRedeemed: number; dogsAdopted: number; dogsEuthanized: number;
    catsImpounded: number; catsRedeemed: number; catsAdopted: number; catsEuthanized: number;
}

const NJ_SHELTER_DATA_2024: RawNJEntry[] = [
    { county: "ATLANTIC", shelter: "Atlantic County Animal Shelter", dogsImpounded: 1304, dogsRedeemed: 498, dogsAdopted: 406, dogsEuthanized: 127, catsImpounded: 1929, catsRedeemed: 99, catsAdopted: 586, catsEuthanized: 416 },
    { county: "ATLANTIC", shelter: "Humane Society of Atlantic County", dogsImpounded: 206, dogsRedeemed: 0, dogsAdopted: 193, dogsEuthanized: 6, catsImpounded: 200, catsRedeemed: 0, catsAdopted: 154, catsEuthanized: 12 },
    { county: "BERGEN", shelter: "Bergen County Animal Shelter", dogsImpounded: 869, dogsRedeemed: 408, dogsAdopted: 272, dogsEuthanized: 38, catsImpounded: 2570, catsRedeemed: 716, catsAdopted: 1019, catsEuthanized: 311 },
    { county: "BERGEN", shelter: "Ramapo Bergen Animal Refuge, Inc.", dogsImpounded: 186, dogsRedeemed: 1, dogsAdopted: 167, dogsEuthanized: 9, catsImpounded: 301, catsRedeemed: 0, catsAdopted: 250, catsEuthanized: 6 },
    { county: "BURLINGTON", shelter: "Burlington County Animal Shelter", dogsImpounded: 1153, dogsRedeemed: 528, dogsAdopted: 453, dogsEuthanized: 110, catsImpounded: 2341, catsRedeemed: 94, catsAdopted: 1344, catsEuthanized: 536 },
    { county: "BURLINGTON", shelter: "Friends of the Burlington County Animal Shelter (Hissy Hut)", dogsImpounded: 0, dogsRedeemed: 0, dogsAdopted: 0, dogsEuthanized: 0, catsImpounded: 0, catsRedeemed: 0, catsAdopted: 0, catsEuthanized: 0 },
    { county: "CAMDEN", shelter: "Animal Welfare Association", dogsImpounded: 831, dogsRedeemed: 5, dogsAdopted: 769, dogsEuthanized: 13, catsImpounded: 1688, catsRedeemed: 15, catsAdopted: 1599, catsEuthanized: 32 },
    { county: "CAMDEN", shelter: "Homeward Bound Pet Adoption Center", dogsImpounded: 1848, dogsRedeemed: 498, dogsAdopted: 1167, dogsEuthanized: 72, catsImpounded: 3656, catsRedeemed: 75, catsAdopted: 2614, catsEuthanized: 150 },
    { county: "CAPE MAY", shelter: "Animal Outreach Center", dogsImpounded: 0, dogsRedeemed: 0, dogsAdopted: 0, dogsEuthanized: 0, catsImpounded: 1, catsRedeemed: 0, catsAdopted: 0, catsEuthanized: 0 },
    { county: "CAPE MAY", shelter: "Beacon Animal Rescue", dogsImpounded: 57, dogsRedeemed: 0, dogsAdopted: 55, dogsEuthanized: 0, catsImpounded: 3, catsRedeemed: 0, catsAdopted: 5, catsEuthanized: 0 },
    { county: "CAPE MAY", shelter: "Cape May County Animal Shelter & Adoption Center", dogsImpounded: 242, dogsRedeemed: 80, dogsAdopted: 85, dogsEuthanized: 7, catsImpounded: 199, catsRedeemed: 50, catsAdopted: 276, catsEuthanized: 22 },
    { county: "CAPE MAY", shelter: "Cape May County Animal Welfare Society", dogsImpounded: 10, dogsRedeemed: 0, dogsAdopted: 11, dogsEuthanized: 2, catsImpounded: 23, catsRedeemed: 0, catsAdopted: 25, catsEuthanized: 2 },
    { county: "CAPE MAY", shelter: "Humane Society of Ocean City", dogsImpounded: 53, dogsRedeemed: 14, dogsAdopted: 32, dogsEuthanized: 2, catsImpounded: 67, catsRedeemed: 4, catsAdopted: 59, catsEuthanized: 5 },
    { county: "ESSEX", shelter: "Alex Caprio Animal Control Facility", dogsImpounded: 54, dogsRedeemed: 24, dogsAdopted: 19, dogsEuthanized: 7, catsImpounded: 26, catsRedeemed: 3, catsAdopted: 6, catsEuthanized: 3 },
    { county: "ESSEX", shelter: "Bloomfield Animal Shelter", dogsImpounded: 151, dogsRedeemed: 80, dogsAdopted: 59, dogsEuthanized: 0, catsImpounded: 249, catsRedeemed: 14, catsAdopted: 167, catsEuthanized: 29 },
    { county: "ESSEX", shelter: "East Orange Animal Pound", dogsImpounded: 132, dogsRedeemed: 48, dogsAdopted: 15, dogsEuthanized: 19, catsImpounded: 57, catsRedeemed: 0, catsAdopted: 6, catsEuthanized: 0 },
    { county: "ESSEX", shelter: "Montclair Twp. Animal Shelter", dogsImpounded: 131, dogsRedeemed: 44, dogsAdopted: 86, dogsEuthanized: 6, catsImpounded: 162, catsRedeemed: 11, catsAdopted: 141, catsEuthanized: 9 },
    { county: "HUNTERDON", shelter: "Glen Manor Veterinary Hospital", dogsImpounded: 24, dogsRedeemed: 18, dogsAdopted: 5, dogsEuthanized: 0, catsImpounded: 26, catsRedeemed: 2, catsAdopted: 20, catsEuthanized: 3 },
    { county: "HUNTERDON", shelter: "Tabby's Place - Cat Sanctuary", dogsImpounded: 0, dogsRedeemed: 0, dogsAdopted: 0, dogsEuthanized: 0, catsImpounded: 408, catsRedeemed: 1, catsAdopted: 281, catsEuthanized: 33 },
    { county: "MERCER", shelter: "EASEL Animal Rescue League", dogsImpounded: 261, dogsRedeemed: 91, dogsAdopted: 156, dogsEuthanized: 5, catsImpounded: 619, catsRedeemed: 5, catsAdopted: 563, catsEuthanized: 6 },
    { county: "MERCER", shelter: "Hamilton Township Animal Shelter", dogsImpounded: 291, dogsRedeemed: 178, dogsAdopted: 85, dogsEuthanized: 10, catsImpounded: 295, catsRedeemed: 19, catsAdopted: 236, catsEuthanized: 20 },
    { county: "MERCER", shelter: "Mercerville Animal Hospital", dogsImpounded: 0, dogsRedeemed: 0, dogsAdopted: 0, dogsEuthanized: 0, catsImpounded: 38, catsRedeemed: 0, catsAdopted: 37, catsEuthanized: 0 },
    { county: "MIDDLESEX", shelter: "Old Bridge Animal Shelter", dogsImpounded: 103, dogsRedeemed: 65, dogsAdopted: 31, dogsEuthanized: 0, catsImpounded: 707, catsRedeemed: 23, catsAdopted: 325, catsEuthanized: 67 },
    { county: "MIDDLESEX", shelter: "Perth Amboy Animal Shelter", dogsImpounded: 141, dogsRedeemed: 100, dogsAdopted: 26, dogsEuthanized: 1, catsImpounded: 45, catsRedeemed: 3, catsAdopted: 21, catsEuthanized: 1 },
    { county: "MONMOUTH", shelter: "Monmouth County SPCA", dogsImpounded: 1087, dogsRedeemed: 436, dogsAdopted: 632, dogsEuthanized: 32, catsImpounded: 1773, catsRedeemed: 67, catsAdopted: 1338, catsEuthanized: 222 },
    { county: "MORRIS", shelter: "Animal Hospital of Roxbury", dogsImpounded: 43, dogsRedeemed: 23, dogsAdopted: 6, dogsEuthanized: 0, catsImpounded: 33, catsRedeemed: 1, catsAdopted: 12, catsEuthanized: 1 },
    { county: "MORRIS", shelter: "Denville Twp. Animal Shelter", dogsImpounded: 42, dogsRedeemed: 31, dogsAdopted: 11, dogsEuthanized: 0, catsImpounded: 28, catsRedeemed: 2, catsAdopted: 30, catsEuthanized: 1 },
    { county: "MORRIS", shelter: "Hodes Veterinary Group", dogsImpounded: 20, dogsRedeemed: 17, dogsAdopted: 1, dogsEuthanized: 2, catsImpounded: 45, catsRedeemed: 7, catsAdopted: 37, catsEuthanized: 1 },
    { county: "MORRIS", shelter: "Jefferson Township Municipal Pound", dogsImpounded: 24, dogsRedeemed: 17, dogsAdopted: 3, dogsEuthanized: 1, catsImpounded: 88, catsRedeemed: 5, catsAdopted: 37, catsEuthanized: 6 },
    { county: "MORRIS", shelter: "Kinnelon Volunteer Animal Shelter", dogsImpounded: 0, dogsRedeemed: 0, dogsAdopted: 0, dogsEuthanized: 0, catsImpounded: 11, catsRedeemed: 0, catsAdopted: 23, catsEuthanized: 0 },
    { county: "MORRIS", shelter: "Montville Animal Shelter", dogsImpounded: 63, dogsRedeemed: 40, dogsAdopted: 18, dogsEuthanized: 0, catsImpounded: 211, catsRedeemed: 11, catsAdopted: 176, catsEuthanized: 12 },
    { county: "MORRIS", shelter: "Parsippany Animal Shelter", dogsImpounded: 81, dogsRedeemed: 56, dogsAdopted: 23, dogsEuthanized: 1, catsImpounded: 204, catsRedeemed: 26, catsAdopted: 122, catsEuthanized: 14 },
    { county: "MORRIS", shelter: "Pequannock Township Animal Shelter", dogsImpounded: 30, dogsRedeemed: 22, dogsAdopted: 6, dogsEuthanized: 1, catsImpounded: 86, catsRedeemed: 0, catsAdopted: 92, catsEuthanized: 1 },
    { county: "MORRIS", shelter: "Randolph Regional Animal Shelter", dogsImpounded: 79, dogsRedeemed: 37, dogsAdopted: 30, dogsEuthanized: 0, catsImpounded: 98, catsRedeemed: 9, catsAdopted: 39, catsEuthanized: 10 },
    { county: "MORRIS", shelter: "Stradbrook Kennels", dogsImpounded: 8, dogsRedeemed: 2, dogsAdopted: 6, dogsEuthanized: 0, catsImpounded: 0, catsRedeemed: 0, catsAdopted: 0, catsEuthanized: 0 },
    { county: "OCEAN", shelter: "Jersey Shore Animal Center", dogsImpounded: 78, dogsRedeemed: 0, dogsAdopted: 75, dogsEuthanized: 0, catsImpounded: 105, catsRedeemed: 0, catsAdopted: 105, catsEuthanized: 0 },
    { county: "OCEAN", shelter: "Northern Ocean County Animal Facility", dogsImpounded: 594, dogsRedeemed: 300, dogsAdopted: 134, dogsEuthanized: 28, catsImpounded: 1212, catsRedeemed: 64, catsAdopted: 531, catsEuthanized: 431 },
    { county: "OCEAN", shelter: "Southern Ocean County Animal Facility", dogsImpounded: 339, dogsRedeemed: 138, dogsAdopted: 131, dogsEuthanized: 28, catsImpounded: 478, catsRedeemed: 43, catsAdopted: 251, catsEuthanized: 97 },
    { county: "PASSAIC", shelter: "Clifton Animal Shelter", dogsImpounded: 166, dogsRedeemed: 109, dogsAdopted: 32, dogsEuthanized: 15, catsImpounded: 190, catsRedeemed: 5, catsAdopted: 124, catsEuthanized: 28 },
    { county: "PASSAIC", shelter: "Homeless Animal Adoption League", dogsImpounded: 0, dogsRedeemed: 0, dogsAdopted: 0, dogsEuthanized: 0, catsImpounded: 38, catsRedeemed: 0, catsAdopted: 29, catsEuthanized: 2 },
    { county: "PASSAIC", shelter: "North Jersey Community Animal Shelter", dogsImpounded: 103, dogsRedeemed: 81, dogsAdopted: 11, dogsEuthanized: 5, catsImpounded: 156, catsRedeemed: 3, catsAdopted: 83, catsEuthanized: 28 },
    { county: "PASSAIC", shelter: "Passaic Animal Shelter", dogsImpounded: 73, dogsRedeemed: 46, dogsAdopted: 15, dogsEuthanized: 4, catsImpounded: 63, catsRedeemed: 4, catsAdopted: 7, catsEuthanized: 3 },
    { county: "PASSAIC", shelter: "Paterson Animal Shelter", dogsImpounded: 391, dogsRedeemed: 121, dogsAdopted: 221, dogsEuthanized: 49, catsImpounded: 303, catsRedeemed: 8, catsAdopted: 266, catsEuthanized: 29 },
    { county: "PASSAIC", shelter: "West Milford Animal Shelter Society", dogsImpounded: 52, dogsRedeemed: 15, dogsAdopted: 30, dogsEuthanized: 5, catsImpounded: 157, catsRedeemed: 10, catsAdopted: 128, catsEuthanized: 3 },
    { county: "SALEM", shelter: "Pennsville Township Animal Pound", dogsImpounded: 166, dogsRedeemed: 58, dogsAdopted: 86, dogsEuthanized: 9, catsImpounded: 563, catsRedeemed: 16, catsAdopted: 370, catsEuthanized: 10 },
    { county: "SALEM", shelter: "Salem County Humane Society", dogsImpounded: 58, dogsRedeemed: 0, dogsAdopted: 53, dogsEuthanized: 2, catsImpounded: 122, catsRedeemed: 1, catsAdopted: 111, catsEuthanized: 3 },
    { county: "SOMERSET", shelter: "S.A.V.E. - Friends to Homeless Animals", dogsImpounded: 237, dogsRedeemed: 64, dogsAdopted: 140, dogsEuthanized: 28, catsImpounded: 489, catsRedeemed: 75, catsAdopted: 379, catsEuthanized: 19 },
    { county: "SUSSEX", shelter: "Father John's Animal House, Inc.", dogsImpounded: 208, dogsRedeemed: 3, dogsAdopted: 256, dogsEuthanized: 3, catsImpounded: 447, catsRedeemed: 1, catsAdopted: 444, catsEuthanized: 4 },
    { county: "SUSSEX", shelter: "Hopatcong Animal Shelter", dogsImpounded: 65, dogsRedeemed: 43, dogsAdopted: 19, dogsEuthanized: 0, catsImpounded: 157, catsRedeemed: 3, catsAdopted: 74, catsEuthanized: 9 },
    { county: "SUSSEX", shelter: "Vernon Township Animal Control", dogsImpounded: 103, dogsRedeemed: 88, dogsAdopted: 13, dogsEuthanized: 1, catsImpounded: 309, catsRedeemed: 24, catsAdopted: 142, catsEuthanized: 14 },
    { county: "UNION", shelter: "Plainfield Area Humane Society", dogsImpounded: 110, dogsRedeemed: 61, dogsAdopted: 36, dogsEuthanized: 7, catsImpounded: 192, catsRedeemed: 3, catsAdopted: 120, catsEuthanized: 18 },
    { county: "UNION", shelter: "Shake-A-Paw", dogsImpounded: 104, dogsRedeemed: 7, dogsAdopted: 95, dogsEuthanized: 0, catsImpounded: 0, catsRedeemed: 0, catsAdopted: 0, catsEuthanized: 0 },
    { county: "UNION", shelter: "Township of Union Animal Shelter", dogsImpounded: 121, dogsRedeemed: 53, dogsAdopted: 4, dogsEuthanized: 6, catsImpounded: 30, catsRedeemed: 0, catsAdopted: 26, catsEuthanized: 15 },
    { county: "WARREN", shelter: "Common Sense for Animals", dogsImpounded: 131, dogsRedeemed: 49, dogsAdopted: 123, dogsEuthanized: 1, catsImpounded: 67, catsRedeemed: 3, catsAdopted: 122, catsEuthanized: 1 },
];

export function getNewJerseyStats(): NewJerseyShelterStats[] {
    return NJ_SHELTER_DATA_2024.map(entry => {
        const totalIntake = entry.dogsImpounded + entry.catsImpounded;
        const totalEuthanized = entry.dogsEuthanized + entry.catsEuthanized;
        const totalAdopted = entry.dogsAdopted + entry.catsAdopted;
        const totalRedeemed = entry.dogsRedeemed + entry.catsRedeemed;
        const liveReleaseRate = totalIntake > 0
            ? Math.round(((totalIntake - totalEuthanized) / totalIntake) * 100) : 0;
        return {
            county: entry.county, shelterName: entry.shelter,
            totalIntake, totalEuthanized, totalAdopted, totalRedeemed, liveReleaseRate,
            dogs: { intake: entry.dogsImpounded, euthanized: entry.dogsEuthanized, adopted: entry.dogsAdopted },
            cats: { intake: entry.catsImpounded, euthanized: entry.catsEuthanized, adopted: entry.catsAdopted },
        };
    }).sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);
}
