import type { ShelterSeedData } from './california-shelters';

export const iowaShelters: ShelterSeedData[] = [
    {
        name: 'Animal Rescue League of Iowa',
        county: 'Polk', state: 'IA',
        address: '5452 NE 22nd St, Des Moines, IA 50313', phone: '(515) 262-9503',
        websiteUrl: 'https://www.arl-iowa.org',
        totalIntakeAnnual: 9000, totalEuthanizedAnnual: 450,
        dataYear: 2024, dataSourceName: 'ARL of Iowa', dataSourceUrl: 'https://www.arl-iowa.org/about/',
        countyPopulation: 492401, totalReturnedToOwner: 1200, totalTransferred: 1500,
        priorYearIntake: 8700, priorYearEuthanized: 435, priorDataYear: 2023,
    },
    {
        name: 'Cedar Rapids Animal Care & Control',
        county: 'Linn', state: 'IA',
        address: '7600 C St SW, Cedar Rapids, IA 52404', phone: '(319) 286-5999',
        websiteUrl: 'https://www.cedar-rapids.org/residents/animal_control/',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 300,
        dataYear: 2024, dataSourceName: 'Cedar Rapids ACC', dataSourceUrl: 'https://www.cedar-rapids.org/residents/animal_control/',
        countyPopulation: 226706, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2900, priorYearEuthanized: 290, priorDataYear: 2023,
    },
];
