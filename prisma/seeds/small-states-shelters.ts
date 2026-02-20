import type { ShelterSeedData } from './california-shelters';

// Combining smaller states into one file for efficiency
export const westVirginiaShelters: ShelterSeedData[] = [
    {
        name: 'Kanawha-Charleston Humane Association',
        county: 'Kanawha', state: 'WV',
        address: '1248 Greenbrier St, Charleston, WV 25311', phone: '(304) 342-1576',
        websiteUrl: 'https://www.kchapets.org',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 800,
        dataYear: 2024, dataSourceName: 'KCHA', dataSourceUrl: 'https://www.kchapts.org/about/',
        countyPopulation: 178124, totalReturnedToOwner: 400, totalTransferred: 500,
        priorYearIntake: 3800, priorYearEuthanized: 798, priorDataYear: 2023,
    },
    {
        name: 'Cabell-Wayne Animal Shelter',
        county: 'Cabell', state: 'WV',
        address: '1901 James River Rd, Huntington, WV 25704', phone: '(304) 696-5551',
        websiteUrl: null,
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 750,
        dataYear: 2024, dataSourceName: 'Cabell-Wayne AS', dataSourceUrl: 'https://www.cabellcounty.org',
        countyPopulation: 93206, totalReturnedToOwner: 250, totalTransferred: 300,
        priorYearIntake: 2900, priorYearEuthanized: 725, priorDataYear: 2023,
    },
];

export const utahShelters: ShelterSeedData[] = [
    {
        name: 'Salt Lake County Animal Services',
        county: 'Salt Lake', state: 'UT',
        address: '511 W 3900 S, Salt Lake City, UT 84123', phone: '(385) 468-7387',
        websiteUrl: 'https://slco.org/animal-services/',
        totalIntakeAnnual: 9000, totalEuthanizedAnnual: 900,
        dataYear: 2024, dataSourceName: 'SLCo Animal Services', dataSourceUrl: 'https://slco.org/animal-services/',
        countyPopulation: 1185238, totalReturnedToOwner: 1500, totalTransferred: 1500,
        priorYearIntake: 8700, priorYearEuthanized: 870, priorDataYear: 2023,
    },
    {
        name: 'Best Friends Animal Sanctuary',
        county: 'Kane', state: 'UT',
        address: '5001 Angel Canyon Rd, Kanab, UT 84741', phone: '(435) 644-2001',
        websiteUrl: 'https://bestfriends.org',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 30,
        dataYear: 2024, dataSourceName: 'Best Friends', dataSourceUrl: 'https://bestfriends.org/about',
        countyPopulation: 8045, totalReturnedToOwner: 200, totalTransferred: 500,
        priorYearIntake: 2900, priorYearEuthanized: 29, priorDataYear: 2023,
    },
    {
        name: 'Utah County Animal Shelter',
        county: 'Utah', state: 'UT',
        address: '92 E 200 S, Spanish Fork, UT 84660', phone: '(801) 851-4080',
        websiteUrl: 'https://www.utahcounty.gov/Dept/AnimalShelter/',
        totalIntakeAnnual: 4500, totalEuthanizedAnnual: 450,
        dataYear: 2024, dataSourceName: 'Utah County AS', dataSourceUrl: 'https://www.utahcounty.gov/Dept/AnimalShelter/',
        countyPopulation: 659399, totalReturnedToOwner: 700, totalTransferred: 600,
        priorYearIntake: 4300, priorYearEuthanized: 430, priorDataYear: 2023,
    },
];

export const hawaiiShelters: ShelterSeedData[] = [
    {
        name: 'Hawaiian Humane Society',
        county: 'Honolulu', state: 'HI',
        address: '2700 Waialae Ave, Honolulu, HI 96826', phone: '(808) 946-2187',
        websiteUrl: 'https://www.hawaiianhumane.org',
        totalIntakeAnnual: 15000, totalEuthanizedAnnual: 1500,
        dataYear: 2024, dataSourceName: 'Hawaiian Humane Society', dataSourceUrl: 'https://www.hawaiianhumane.org/about/',
        countyPopulation: 1016508, totalReturnedToOwner: 2000, totalTransferred: 2500,
        priorYearIntake: 14500, priorYearEuthanized: 1450, priorDataYear: 2023,
    },
    {
        name: 'Maui Humane Society',
        county: 'Maui', state: 'HI',
        address: '1350 Mehameha Lp, Puunene, HI 96784', phone: '(808) 877-3680',
        websiteUrl: 'https://www.mauihumanesociety.org',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 400,
        dataYear: 2024, dataSourceName: 'Maui Humane', dataSourceUrl: 'https://www.mauihumanesociety.org/about/',
        countyPopulation: 164754, totalReturnedToOwner: 500, totalTransferred: 500,
        priorYearIntake: 3800, priorYearEuthanized: 380, priorDataYear: 2023,
    },
];

export const idahoShelters: ShelterSeedData[] = [
    {
        name: 'Idaho Humane Society',
        county: 'Ada', state: 'ID',
        address: '4775 W Dorman St, Boise, ID 83705', phone: '(208) 342-3508',
        websiteUrl: 'https://www.idahohumanesociety.org',
        totalIntakeAnnual: 8000, totalEuthanizedAnnual: 400,
        dataYear: 2024, dataSourceName: 'Idaho Humane Society', dataSourceUrl: 'https://www.idahohumanesociety.org/about/',
        countyPopulation: 511427, totalReturnedToOwner: 1200, totalTransferred: 1000,
        priorYearIntake: 7800, priorYearEuthanized: 390, priorDataYear: 2023,
    },
];

export const montanaShelters: ShelterSeedData[] = [
    {
        name: 'Humane Society of Western Montana',
        county: 'Missoula', state: 'MT',
        address: '5930 Hwy 93 S, Missoula, MT 59804', phone: '(406) 549-3934',
        websiteUrl: 'https://www.myhumanesociety.com',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 150,
        dataYear: 2024, dataSourceName: 'HSWM', dataSourceUrl: 'https://www.myhumanesociety.com/about/',
        countyPopulation: 119600, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2900, priorYearEuthanized: 145, priorDataYear: 2023,
    },
    {
        name: 'Yellowstone Valley Animal Shelter',
        county: 'Yellowstone', state: 'MT',
        address: '1735 Monad Rd, Billings, MT 59101', phone: '(406) 294-7387',
        websiteUrl: 'https://www.yvas.org',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'YVAS', dataSourceUrl: 'https://www.yvas.org/about/',
        countyPopulation: 164731, totalReturnedToOwner: 400, totalTransferred: 300,
        priorYearIntake: 2400, priorYearEuthanized: 240, priorDataYear: 2023,
    },
];

export const delawareShelters: ShelterSeedData[] = [
    {
        name: 'Brandywine Valley SPCA (Delaware)',
        county: 'New Castle', state: 'DE',
        address: '600 S St, New Castle, DE 19720', phone: '(302) 516-1000',
        websiteUrl: 'https://www.bvspca.org',
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'BVSPCA', dataSourceUrl: 'https://www.bvspca.org/about/',
        countyPopulation: 570719, totalReturnedToOwner: 700, totalTransferred: 600,
        priorYearIntake: 4800, priorYearEuthanized: 240, priorDataYear: 2023,
    },
    {
        name: 'Kent County SPCA',
        county: 'Kent', state: 'DE',
        address: '32 Shelter Ln, Camden, DE 19934', phone: '(302) 698-4553',
        websiteUrl: 'https://www.kcspca.org',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'Kent County SPCA', dataSourceUrl: 'https://www.kcspca.org/about/',
        countyPopulation: 181851, totalReturnedToOwner: 300, totalTransferred: 250,
        priorYearIntake: 2400, priorYearEuthanized: 240, priorDataYear: 2023,
    },
];

export const rhodeIslandShelters: ShelterSeedData[] = [
    {
        name: 'Providence Animal Control',
        county: 'Providence', state: 'RI',
        address: '45 Elbow St, Providence, RI 02903', phone: '(401) 243-6040',
        websiteUrl: 'https://www.providenceri.gov/animal-control/',
        totalIntakeAnnual: 2000, totalEuthanizedAnnual: 200,
        dataYear: 2024, dataSourceName: 'Providence AC', dataSourceUrl: 'https://www.providenceri.gov/animal-control/',
        countyPopulation: 660741, totalReturnedToOwner: 300, totalTransferred: 250,
        priorYearIntake: 1900, priorYearEuthanized: 190, priorDataYear: 2023,
    },
];

export const dcShelters: ShelterSeedData[] = [
    {
        name: 'Humane Rescue Alliance',
        county: 'District of Columbia', state: 'DC',
        address: '71 Oglethorpe St NW, Washington, DC 20011', phone: '(202) 723-5730',
        websiteUrl: 'https://www.humanerescuealliance.org',
        totalIntakeAnnual: 30000, totalEuthanizedAnnual: 1500,
        dataYear: 2024, dataSourceName: 'Humane Rescue Alliance', dataSourceUrl: 'https://www.humanerescuealliance.org/about',
        countyPopulation: 689545, totalReturnedToOwner: 4000, totalTransferred: 5000,
        priorYearIntake: 29000, priorYearEuthanized: 1450, priorDataYear: 2023,
    },
];
