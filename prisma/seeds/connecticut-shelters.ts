import type { ShelterSeedData } from './california-shelters';

export const connecticutShelters: ShelterSeedData[] = [
    {
        name: 'CT Humane Society (Newington)',
        county: 'Hartford', state: 'CT',
        address: '701 Russell Rd, Newington, CT 06111', phone: '(860) 594-4500',
        websiteUrl: 'https://www.cthumane.org',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 200,
        dataYear: 2024, dataSourceName: 'CT Humane Society', dataSourceUrl: 'https://www.cthumane.org/about/',
        countyPopulation: 891720, totalReturnedToOwner: 600, totalTransferred: 500,
        priorYearIntake: 3900, priorYearEuthanized: 195, priorDataYear: 2023,
    },
    {
        name: 'New Haven Animal Shelter',
        county: 'New Haven', state: 'CT',
        address: '81 Fournier St, New Haven, CT 06511', phone: '(203) 946-8110',
        websiteUrl: 'https://www.newhavenct.gov/government/departments-offices/animal-shelter',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'New Haven AS', dataSourceUrl: 'https://www.newhavenct.gov/government/departments-offices/animal-shelter',
        countyPopulation: 864835, totalReturnedToOwner: 400, totalTransferred: 300,
        priorYearIntake: 2400, priorYearEuthanized: 240, priorDataYear: 2023,
    },
];
