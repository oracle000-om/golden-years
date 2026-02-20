import type { ShelterSeedData } from './california-shelters';

export const arkansasShelters: ShelterSeedData[] = [
    {
        name: 'Little Rock Animal Village',
        county: 'Pulaski', state: 'AR',
        address: '4500 Kramer St, Little Rock, AR 72204', phone: '(501) 376-3067',
        websiteUrl: 'https://www.littlerock.gov/for-residents/animal-services/',
        totalIntakeAnnual: 6000, totalEuthanizedAnnual: 1500,
        dataYear: 2024, dataSourceName: 'LR Animal Village', dataSourceUrl: 'https://www.littlerock.gov/for-residents/animal-services/',
        countyPopulation: 399125, totalReturnedToOwner: 600, totalTransferred: 700,
        priorYearIntake: 5800, priorYearEuthanized: 1508, priorDataYear: 2023,
    },
    {
        name: 'NW Arkansas Animal Shelter (Fayetteville)',
        county: 'Washington', state: 'AR',
        address: '1640 S Armstrong Ave, Fayetteville, AR 72701', phone: '(479) 444-3456',
        websiteUrl: 'https://www.fayetteville-ar.gov/1100/Animal-Services',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 350,
        dataYear: 2024, dataSourceName: 'Fayetteville Animal Services', dataSourceUrl: 'https://www.fayetteville-ar.gov/1100/Animal-Services',
        countyPopulation: 245871, totalReturnedToOwner: 500, totalTransferred: 450,
        priorYearIntake: 3400, priorYearEuthanized: 340, priorDataYear: 2023,
    },
    {
        name: 'Fort Smith Animal Services',
        county: 'Sebastian', state: 'AR',
        address: '5512 Zero St, Fort Smith, AR 72903', phone: '(479) 784-2945',
        websiteUrl: 'https://www.fortsmithar.gov/animal-services',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 1000,
        dataYear: 2024, dataSourceName: 'Fort Smith AS', dataSourceUrl: 'https://www.fortsmithar.gov/animal-services',
        countyPopulation: 127827, totalReturnedToOwner: 350, totalTransferred: 400,
        priorYearIntake: 3800, priorYearEuthanized: 988, priorDataYear: 2023,
    },
];
