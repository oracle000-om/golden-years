import type { ShelterSeedData } from './california-shelters';

export const nebraskaShelters: ShelterSeedData[] = [
    {
        name: 'Nebraska Humane Society',
        county: 'Douglas', state: 'NE',
        address: '8929 Fort St, Omaha, NE 68134', phone: '(402) 444-7800',
        websiteUrl: 'https://www.nehumanesociety.org',
        totalIntakeAnnual: 17000, totalEuthanizedAnnual: 1700,
        dataYear: 2024, dataSourceName: 'Nebraska Humane Society', dataSourceUrl: 'https://www.nehumanesociety.org/about/',
        countyPopulation: 584526, totalReturnedToOwner: 2500, totalTransferred: 3000,
        priorYearIntake: 16500, priorYearEuthanized: 1650, priorDataYear: 2023,
    },
    {
        name: 'Capital Humane Society (Lincoln)',
        county: 'Lancaster', state: 'NE',
        address: '6500 S 70th St, Lincoln, NE 68516', phone: '(402) 441-4488',
        websiteUrl: 'https://www.capitalhumanesociety.org',
        totalIntakeAnnual: 6000, totalEuthanizedAnnual: 300,
        dataYear: 2024, dataSourceName: 'Capital Humane Society', dataSourceUrl: 'https://www.capitalhumanesociety.org/about/',
        countyPopulation: 319090, totalReturnedToOwner: 900, totalTransferred: 800,
        priorYearIntake: 5800, priorYearEuthanized: 290, priorDataYear: 2023,
    },
];
