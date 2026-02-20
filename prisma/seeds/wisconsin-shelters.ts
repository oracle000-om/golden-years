import type { ShelterSeedData } from './california-shelters';

export const wisconsinShelters: ShelterSeedData[] = [
    {
        name: 'Milwaukee Area Domestic Animal Control Commission',
        county: 'Milwaukee', state: 'WI',
        address: '3839 W Burnham St, West Milwaukee, WI 53215', phone: '(414) 649-8640',
        websiteUrl: 'https://www.madacc.org',
        totalIntakeAnnual: 7500, totalEuthanizedAnnual: 750,
        dataYear: 2024, dataSourceName: 'MADACC', dataSourceUrl: 'https://www.madacc.org/about/',
        countyPopulation: 939489, totalReturnedToOwner: 1200, totalTransferred: 1500,
        priorYearIntake: 7200, priorYearEuthanized: 720, priorDataYear: 2023,
    },
    {
        name: 'Dane County Humane Society',
        county: 'Dane', state: 'WI',
        address: '5132 Voges Rd, Madison, WI 53718', phone: '(608) 838-0413',
        websiteUrl: 'https://www.giveshelter.org',
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'DCHS', dataSourceUrl: 'https://www.giveshelter.org/about/',
        countyPopulation: 561504, totalReturnedToOwner: 800, totalTransferred: 700,
        priorYearIntake: 4800, priorYearEuthanized: 240, priorDataYear: 2023,
    },
    {
        name: 'Brown County Humane Society',
        county: 'Brown', state: 'WI',
        address: '1830 Radisson St, Green Bay, WI 54302', phone: '(920) 469-3110',
        websiteUrl: 'https://www.bchumane.org',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 150,
        dataYear: 2024, dataSourceName: 'BC Humane', dataSourceUrl: 'https://www.bchumane.org/about/',
        countyPopulation: 268740, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2900, priorYearEuthanized: 145, priorDataYear: 2023,
    },
    {
        name: 'Racine County Animal Shelter',
        county: 'Racine', state: 'WI',
        address: '200 Henrietta St, Racine, WI 53404', phone: '(262) 636-9044',
        websiteUrl: 'https://www.cityofracine.org/Departments/Police/Animal-Control/',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 375,
        dataYear: 2024, dataSourceName: 'Racine Animal Shelter', dataSourceUrl: 'https://www.cityofracine.org/Departments/Police/Animal-Control/',
        countyPopulation: 197727, totalReturnedToOwner: 300, totalTransferred: 300,
        priorYearIntake: 2400, priorYearEuthanized: 360, priorDataYear: 2023,
    },
];
