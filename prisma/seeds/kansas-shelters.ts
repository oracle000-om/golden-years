import type { ShelterSeedData } from './california-shelters';

export const kansasShelters: ShelterSeedData[] = [
    {
        name: 'Kansas Humane Society (Wichita)',
        county: 'Sedgwick', state: 'KS',
        address: '3313 N Hillside Ave, Wichita, KS 67219', phone: '(316) 524-9196',
        websiteUrl: 'https://www.kshumane.org',
        totalIntakeAnnual: 8000, totalEuthanizedAnnual: 800,
        dataYear: 2024, dataSourceName: 'Kansas Humane Society', dataSourceUrl: 'https://www.kshumane.org/about/',
        countyPopulation: 523824, totalReturnedToOwner: 1000, totalTransferred: 1200,
        priorYearIntake: 7800, priorYearEuthanized: 780, priorDataYear: 2023,
    },
    {
        name: 'Great Plains SPCA (Kansas City)',
        county: 'Johnson', state: 'KS',
        address: '5424 Antioch Dr, Merriam, KS 66202', phone: '(913) 831-4400',
        websiteUrl: 'https://www.greatplainsspca.org',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 175,
        dataYear: 2024, dataSourceName: 'Great Plains SPCA', dataSourceUrl: 'https://www.greatplainsspca.org/about/',
        countyPopulation: 609863, totalReturnedToOwner: 500, totalTransferred: 450,
        priorYearIntake: 3400, priorYearEuthanized: 170, priorDataYear: 2023,
    },
];
