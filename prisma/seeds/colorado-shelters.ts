import type { ShelterSeedData } from './california-shelters';

export const coloradoShelters: ShelterSeedData[] = [
    {
        name: 'Denver Animal Shelter',
        county: 'Denver', state: 'CO',
        address: '1241 W Bayaud Ave, Denver, CO 80223', phone: '(720) 913-1311',
        websiteUrl: 'https://www.denvergov.org/Government/Agencies-Departments-Offices/Animal-Shelter',
        totalIntakeAnnual: 8000, totalEuthanizedAnnual: 400,
        dataYear: 2024, dataSourceName: 'Denver Animal Shelter', dataSourceUrl: 'https://www.denvergov.org/Government/Agencies-Departments-Offices/Animal-Shelter',
        countyPopulation: 713252, totalReturnedToOwner: 1200, totalTransferred: 1500,
        priorYearIntake: 7800, priorYearEuthanized: 390, priorDataYear: 2023,
    },
    {
        name: 'El Paso County Humane Society',
        county: 'El Paso', state: 'CO',
        address: '610 Abbot Ln, Colorado Springs, CO 80905', phone: '(719) 473-1741',
        websiteUrl: 'https://www.hsppr.org',
        totalIntakeAnnual: 7000, totalEuthanizedAnnual: 700,
        dataYear: 2024, dataSourceName: 'HSPPR', dataSourceUrl: 'https://www.hsppr.org/about/',
        countyPopulation: 730395, totalReturnedToOwner: 1000, totalTransferred: 1200,
        priorYearIntake: 6800, priorYearEuthanized: 680, priorDataYear: 2023,
    },
    {
        name: 'Larimer Humane Society',
        county: 'Larimer', state: 'CO',
        address: '3501 E 71st St, Loveland, CO 80538', phone: '(970) 226-3647',
        websiteUrl: 'https://www.larimerhumane.org',
        totalIntakeAnnual: 4500, totalEuthanizedAnnual: 225,
        dataYear: 2024, dataSourceName: 'Larimer Humane', dataSourceUrl: 'https://www.larimerhumane.org/about/',
        countyPopulation: 359066, totalReturnedToOwner: 700, totalTransferred: 600,
        priorYearIntake: 4300, priorYearEuthanized: 215, priorDataYear: 2023,
    },
    {
        name: 'Adams County Animal Shelter',
        county: 'Adams', state: 'CO',
        address: '9755 Henderson Rd, Brighton, CO 80601', phone: '(720) 523-7387',
        websiteUrl: 'https://www.adcogov.org/animal-management',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 400,
        dataYear: 2024, dataSourceName: 'Adams County Government', dataSourceUrl: 'https://www.adcogov.org/animal-management',
        countyPopulation: 519572, totalReturnedToOwner: 600, totalTransferred: 500,
        priorYearIntake: 3800, priorYearEuthanized: 380, priorDataYear: 2023,
    },
];
