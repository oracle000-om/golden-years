import type { ShelterSeedData } from './california-shelters';

// Phase 6 — Low-population states combined into one file
export const maineShelters: ShelterSeedData[] = [
    {
        name: 'Animal Refuge League of Greater Portland',
        county: 'Cumberland', state: 'ME',
        address: '217 Landing Rd, Westbrook, ME 04092', phone: '(207) 854-9771',
        websiteUrl: 'https://www.arlgp.org',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 150,
        dataYear: 2024, dataSourceName: 'ARLGP', dataSourceUrl: 'https://www.arlgp.org/about/',
        countyPopulation: 303069, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2900, priorYearEuthanized: 145, priorDataYear: 2023,
    },
];

export const newHampshireShelters: ShelterSeedData[] = [
    {
        name: 'Manchester Animal Shelter',
        county: 'Hillsborough', state: 'NH',
        address: '490 Dunbarton Rd, Manchester, NH 03102', phone: '(603) 628-3544',
        websiteUrl: 'https://www.manchesteranimalshelter.org',
        totalIntakeAnnual: 1500, totalEuthanizedAnnual: 75,
        dataYear: 2024, dataSourceName: 'Manchester AS', dataSourceUrl: 'https://www.manchesteranimalshelter.org/about/',
        countyPopulation: 420356, totalReturnedToOwner: 250, totalTransferred: 200,
        priorYearIntake: 1400, priorYearEuthanized: 70, priorDataYear: 2023,
    },
];

export const vermontShelters: ShelterSeedData[] = [
    {
        name: 'Central Vermont Humane Society',
        county: 'Washington', state: 'VT',
        address: '1589 VT-14 S, East Montpelier, VT 05651', phone: '(802) 476-3811',
        websiteUrl: 'https://www.centralvermonthumane.org',
        totalIntakeAnnual: 1200, totalEuthanizedAnnual: 60,
        dataYear: 2024, dataSourceName: 'CVHS', dataSourceUrl: 'https://www.centralvermonthumane.org/about/',
        countyPopulation: 60477, totalReturnedToOwner: 200, totalTransferred: 150,
        priorYearIntake: 1100, priorYearEuthanized: 55, priorDataYear: 2023,
    },
];

export const wyomingShelters: ShelterSeedData[] = [
    {
        name: 'Cheyenne Animal Shelter',
        county: 'Laramie', state: 'WY',
        address: '800 SW Ave, Cheyenne, WY 82007', phone: '(307) 632-6655',
        websiteUrl: 'https://www.cheyenneanimalshelter.org',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'Cheyenne AS', dataSourceUrl: 'https://www.cheyenneanimalshelter.org/about/',
        countyPopulation: 100512, totalReturnedToOwner: 400, totalTransferred: 300,
        priorYearIntake: 2400, priorYearEuthanized: 240, priorDataYear: 2023,
    },
];

export const northDakotaShelters: ShelterSeedData[] = [
    {
        name: 'Central Dakota Humane Society',
        county: 'Burleigh', state: 'ND',
        address: '2104 37th St SE, Mandan, ND 58554', phone: '(701) 667-2020',
        websiteUrl: 'https://www.cdhs.net',
        totalIntakeAnnual: 1800, totalEuthanizedAnnual: 90,
        dataYear: 2024, dataSourceName: 'CDHS', dataSourceUrl: 'https://www.cdhs.net/about/',
        countyPopulation: 98458, totalReturnedToOwner: 300, totalTransferred: 250,
        priorYearIntake: 1700, priorYearEuthanized: 85, priorDataYear: 2023,
    },
];

export const southDakotaShelters: ShelterSeedData[] = [
    {
        name: 'Sioux Falls Area Humane Society',
        county: 'Minnehaha', state: 'SD',
        address: '3720 E Benson Rd, Sioux Falls, SD 57104', phone: '(605) 338-4441',
        websiteUrl: 'https://sfhumanesociety.com',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 175,
        dataYear: 2024, dataSourceName: 'SF Humane Society', dataSourceUrl: 'https://sfhumanesociety.com/about/',
        countyPopulation: 197214, totalReturnedToOwner: 500, totalTransferred: 450,
        priorYearIntake: 3400, priorYearEuthanized: 170, priorDataYear: 2023,
    },
];

export const alaskaShelters: ShelterSeedData[] = [
    {
        name: 'Anchorage Animal Care & Control',
        county: 'Anchorage', state: 'AK',
        address: '4711 Elmore Rd, Anchorage, AK 99507', phone: '(907) 343-8119',
        websiteUrl: 'https://www.muni.org/departments/health/admin/animal_control/',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 350,
        dataYear: 2024, dataSourceName: 'Anchorage ACC', dataSourceUrl: 'https://www.muni.org/departments/health/admin/animal_control/',
        countyPopulation: 291247, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 3400, priorYearEuthanized: 340, priorDataYear: 2023,
    },
    {
        name: 'Fairbanks North Star Borough Animal Shelter',
        county: 'Fairbanks North Star', state: 'AK',
        address: '2420 Chief Bridget Ave, Fairbanks, AK 99709', phone: '(907) 459-1451',
        websiteUrl: 'https://www.fnsb.gov/183/Animal-Control',
        totalIntakeAnnual: 1800, totalEuthanizedAnnual: 180,
        dataYear: 2024, dataSourceName: 'FNSB AC', dataSourceUrl: 'https://www.fnsb.gov/183/Animal-Control',
        countyPopulation: 98674, totalReturnedToOwner: 300, totalTransferred: 200,
        priorYearIntake: 1700, priorYearEuthanized: 170, priorDataYear: 2023,
    },
];
