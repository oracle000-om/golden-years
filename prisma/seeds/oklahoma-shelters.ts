import type { ShelterSeedData } from './california-shelters';

export const oklahomaShelters: ShelterSeedData[] = [
    {
        name: 'Oklahoma City Animal Welfare',
        county: 'Oklahoma', state: 'OK',
        address: '2811 SE 29th St, Oklahoma City, OK 73129', phone: '(405) 297-3100',
        websiteUrl: 'https://www.okc.gov/departments/animal-welfare',
        totalIntakeAnnual: 15000, totalEuthanizedAnnual: 3000,
        dataYear: 2024, dataSourceName: 'OKC Animal Welfare', dataSourceUrl: 'https://www.okc.gov/departments/animal-welfare',
        countyPopulation: 797434, totalReturnedToOwner: 1500, totalTransferred: 2000,
        priorYearIntake: 14500, priorYearEuthanized: 3045, priorDataYear: 2023,
    },
    {
        name: 'Tulsa Animal Welfare',
        county: 'Tulsa', state: 'OK',
        address: '3031 N Erie Ave, Tulsa, OK 74110', phone: '(918) 596-8001',
        websiteUrl: 'https://www.cityoftulsa.org/government/departments/animal-welfare/',
        totalIntakeAnnual: 10000, totalEuthanizedAnnual: 2000,
        dataYear: 2024, dataSourceName: 'Tulsa Animal Welfare', dataSourceUrl: 'https://www.cityoftulsa.org/government/departments/animal-welfare/',
        countyPopulation: 669279, totalReturnedToOwner: 1000, totalTransferred: 1300,
        priorYearIntake: 9700, priorYearEuthanized: 2037, priorDataYear: 2023,
    },
    {
        name: 'Cleveland County Animal Shelter',
        county: 'Cleveland', state: 'OK',
        address: '2261 Boren Blvd, Norman, OK 73069', phone: '(405) 292-3789',
        websiteUrl: 'https://www.clevelandcountyok.com/160/Animal-Welfare',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 800,
        dataYear: 2024, dataSourceName: 'Cleveland County AW', dataSourceUrl: 'https://www.clevelandcountyok.com/160/Animal-Welfare',
        countyPopulation: 284014, totalReturnedToOwner: 400, totalTransferred: 500,
        priorYearIntake: 3800, priorYearEuthanized: 798, priorDataYear: 2023,
    },
    {
        name: 'Comanche County Humane Society',
        county: 'Comanche', state: 'OK',
        address: '706 SW Bishop Rd, Lawton, OK 73501', phone: '(580) 355-1516',
        websiteUrl: 'https://www.comanchecountyhs.com',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 875,
        dataYear: 2024, dataSourceName: 'Comanche County HS', dataSourceUrl: 'https://www.comanchecountyhs.com',
        countyPopulation: 121070, totalReturnedToOwner: 300, totalTransferred: 400,
        priorYearIntake: 3400, priorYearEuthanized: 850, priorDataYear: 2023,
    },
];
