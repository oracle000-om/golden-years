import type { ShelterSeedData } from './california-shelters';

export const minnesotaShelters: ShelterSeedData[] = [
    {
        name: 'Animal Humane Society (Twin Cities)',
        county: 'Hennepin', state: 'MN',
        address: '845 Meadow Ln N, Golden Valley, MN 55422', phone: '(952) 435-7738',
        websiteUrl: 'https://www.animalhumanesociety.org',
        totalIntakeAnnual: 20000, totalEuthanizedAnnual: 1000,
        dataYear: 2024, dataSourceName: 'Animal Humane Society', dataSourceUrl: 'https://www.animalhumanesociety.org/about',
        countyPopulation: 1281565, totalReturnedToOwner: 2500, totalTransferred: 3000,
        priorYearIntake: 19500, priorYearEuthanized: 975, priorDataYear: 2023,
    },
    {
        name: 'Ramsey County Animal Control',
        county: 'Ramsey', state: 'MN',
        address: '1115 Beulah Ln, St. Paul, MN 55108', phone: '(651) 266-1100',
        websiteUrl: 'https://www.ramseycounty.us/residents/health-medical/animal-control',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 350,
        dataYear: 2024, dataSourceName: 'Ramsey County', dataSourceUrl: 'https://www.ramseycounty.us/residents/health-medical/animal-control',
        countyPopulation: 552352, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 3400, priorYearEuthanized: 340, priorDataYear: 2023,
    },
    {
        name: 'Duluth Animal Shelter',
        county: 'St. Louis', state: 'MN',
        address: '139 W Michigan St, Duluth, MN 55802', phone: '(218) 723-3259',
        websiteUrl: 'https://www.animalalliesduluth.org',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'Animal Allies Duluth', dataSourceUrl: 'https://www.animalalliesduluth.org/about/',
        countyPopulation: 200231, totalReturnedToOwner: 350, totalTransferred: 300,
        priorYearIntake: 2400, priorYearEuthanized: 240, priorDataYear: 2023,
    },
];
