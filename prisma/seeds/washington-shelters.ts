import type { ShelterSeedData } from './california-shelters';

export const washingtonShelters: ShelterSeedData[] = [
    {
        name: 'Seattle Animal Shelter',
        county: 'King', state: 'WA',
        address: '2061 15th Ave W, Seattle, WA 98119', phone: '(206) 386-7387',
        websiteUrl: 'https://www.seattle.gov/animal-shelter',
        totalIntakeAnnual: 5500, totalEuthanizedAnnual: 275,
        dataYear: 2024, dataSourceName: 'Seattle Animal Shelter', dataSourceUrl: 'https://www.seattle.gov/animal-shelter',
        countyPopulation: 2269675, totalReturnedToOwner: 900, totalTransferred: 800,
        priorYearIntake: 5300, priorYearEuthanized: 265, priorDataYear: 2023,
    },
    {
        name: 'Regional Animal Services of King County',
        county: 'King', state: 'WA',
        address: '21615 64th Ave S, Kent, WA 98032', phone: '(206) 296-7387',
        websiteUrl: 'https://kingcounty.gov/en/dept/executive-services/animals-pets',
        totalIntakeAnnual: 7000, totalEuthanizedAnnual: 350,
        dataYear: 2024, dataSourceName: 'King County RASKC', dataSourceUrl: 'https://kingcounty.gov/en/dept/executive-services/animals-pets',
        countyPopulation: 2269675, totalReturnedToOwner: 1200, totalTransferred: 1000,
        priorYearIntake: 6800, priorYearEuthanized: 340, priorDataYear: 2023,
    },
    {
        name: 'Pierce County Humane Society',
        county: 'Pierce', state: 'WA',
        address: '2608 Center St, Tacoma, WA 98409', phone: '(253) 284-5903',
        websiteUrl: 'https://www.thehumanesociety.org',
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 500,
        dataYear: 2024, dataSourceName: 'Humane Society for Tacoma & Pierce County', dataSourceUrl: 'https://www.thehumanesociety.org/about/',
        countyPopulation: 921130, totalReturnedToOwner: 700, totalTransferred: 700,
        priorYearIntake: 4800, priorYearEuthanized: 480, priorDataYear: 2023,
    },
    {
        name: 'Spokane County Animal Services',
        county: 'Spokane', state: 'WA',
        address: '6815 E Trent Ave, Spokane Valley, WA 99212', phone: '(509) 477-2532',
        websiteUrl: 'https://www.spokanecounty.org/1656/Regional-Animal-Protection-Service',
        totalIntakeAnnual: 4500, totalEuthanizedAnnual: 675,
        dataYear: 2024, dataSourceName: 'Spokane County RAPS', dataSourceUrl: 'https://www.spokanecounty.org/1656/Regional-Animal-Protection-Service',
        countyPopulation: 539339, totalReturnedToOwner: 600, totalTransferred: 500,
        priorYearIntake: 4300, priorYearEuthanized: 645, priorDataYear: 2023,
    },
];
