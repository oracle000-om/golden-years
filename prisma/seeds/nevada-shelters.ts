import type { ShelterSeedData } from './california-shelters';

export const nevadaShelters: ShelterSeedData[] = [
    {
        name: 'The Animal Foundation (Las Vegas)',
        county: 'Clark', state: 'NV',
        address: '655 N Mojave Rd, Las Vegas, NV 89101', phone: '(702) 384-3333',
        websiteUrl: 'https://animalfoundation.com',
        totalIntakeAnnual: 35000, totalEuthanizedAnnual: 5250,
        dataYear: 2024, dataSourceName: 'The Animal Foundation', dataSourceUrl: 'https://animalfoundation.com/about-us',
        countyPopulation: 2265461, totalReturnedToOwner: 4000, totalTransferred: 5000,
        priorYearIntake: 34000, priorYearEuthanized: 5440, priorDataYear: 2023,
    },
    {
        name: 'Washoe County Regional Animal Services',
        county: 'Washoe', state: 'NV',
        address: '2825 Longley Ln, Reno, NV 89502', phone: '(775) 353-8900',
        websiteUrl: 'https://www.washoecounty.gov/animal/',
        totalIntakeAnnual: 8000, totalEuthanizedAnnual: 800,
        dataYear: 2024, dataSourceName: 'Washoe County RAS', dataSourceUrl: 'https://www.washoecounty.gov/animal/',
        countyPopulation: 486492, totalReturnedToOwner: 1200, totalTransferred: 1000,
        priorYearIntake: 7700, priorYearEuthanized: 770, priorDataYear: 2023,
    },
    {
        name: 'Carson City Animal Services',
        county: 'Carson City', state: 'NV',
        address: '549 Airport Rd, Carson City, NV 89701', phone: '(775) 887-2171',
        websiteUrl: 'https://www.carson.org/government/departments-a-f/animal-services',
        totalIntakeAnnual: 2000, totalEuthanizedAnnual: 200,
        dataYear: 2024, dataSourceName: 'Carson City AS', dataSourceUrl: 'https://www.carson.org/government/departments-a-f/animal-services',
        countyPopulation: 58639, totalReturnedToOwner: 300, totalTransferred: 250,
        priorYearIntake: 1900, priorYearEuthanized: 190, priorDataYear: 2023,
    },
];
