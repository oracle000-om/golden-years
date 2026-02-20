import type { ShelterSeedData } from './california-shelters';

export const kentuckyShelters: ShelterSeedData[] = [
    {
        name: 'Louisville Metro Animal Services',
        county: 'Jefferson', state: 'KY',
        address: '3528 Newburg Rd, Louisville, KY 40218', phone: '(502) 473-7387',
        websiteUrl: 'https://louisvilleky.gov/government/animal-services',
        totalIntakeAnnual: 8000, totalEuthanizedAnnual: 1600,
        dataYear: 2024, dataSourceName: 'Louisville Metro AS', dataSourceUrl: 'https://louisvilleky.gov/government/animal-services',
        countyPopulation: 782969, totalReturnedToOwner: 1000, totalTransferred: 1200,
        priorYearIntake: 7800, priorYearEuthanized: 1638, priorDataYear: 2023,
    },
    {
        name: 'Lexington Humane Society',
        county: 'Fayette', state: 'KY',
        address: '1600 Old Frankfort Pike, Lexington, KY 40504', phone: '(859) 233-0044',
        websiteUrl: 'https://www.lexingtonhumanesociety.org',
        totalIntakeAnnual: 5500, totalEuthanizedAnnual: 550,
        dataYear: 2024, dataSourceName: 'Lexington Humane', dataSourceUrl: 'https://www.lexingtonhumanesociety.org/about/',
        countyPopulation: 322570, totalReturnedToOwner: 800, totalTransferred: 700,
        priorYearIntake: 5300, priorYearEuthanized: 530, priorDataYear: 2023,
    },
    {
        name: 'Kenton County Animal Shelter',
        county: 'Kenton', state: 'KY',
        address: '901 Orphanage Rd, Ft Mitchell, KY 41017', phone: '(859) 356-7400',
        websiteUrl: 'https://www.kentoncounty.org/271/Animals',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 450,
        dataYear: 2024, dataSourceName: 'Kenton County AS', dataSourceUrl: 'https://www.kentoncounty.org/271/Animals',
        countyPopulation: 166998, totalReturnedToOwner: 400, totalTransferred: 350,
        priorYearIntake: 2900, priorYearEuthanized: 435, priorDataYear: 2023,
    },
];
