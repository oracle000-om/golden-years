import type { ShelterSeedData } from './california-shelters';

export const oregonShelters: ShelterSeedData[] = [
    {
        name: 'Oregon Humane Society',
        county: 'Multnomah', state: 'OR',
        address: '1067 NE Columbia Blvd, Portland, OR 97211', phone: '(503) 285-7722',
        websiteUrl: 'https://www.oregonhumane.org',
        totalIntakeAnnual: 11000, totalEuthanizedAnnual: 550,
        dataYear: 2024, dataSourceName: 'Oregon Humane Society', dataSourceUrl: 'https://www.oregonhumane.org/about/',
        countyPopulation: 815428, totalReturnedToOwner: 1500, totalTransferred: 2000,
        priorYearIntake: 10700, priorYearEuthanized: 535, priorDataYear: 2023,
    },
    {
        name: 'Multnomah County Animal Services',
        county: 'Multnomah', state: 'OR',
        address: '1700 W Historic Columbia River Hwy, Troutdale, OR 97060', phone: '(503) 988-7387',
        websiteUrl: 'https://www.multcopets.org',
        totalIntakeAnnual: 6000, totalEuthanizedAnnual: 600,
        dataYear: 2024, dataSourceName: 'Multnomah County AS', dataSourceUrl: 'https://www.multcopets.org/about',
        countyPopulation: 815428, totalReturnedToOwner: 900, totalTransferred: 800,
        priorYearIntake: 5800, priorYearEuthanized: 580, priorDataYear: 2023,
    },
    {
        name: 'Lane County Animal Services',
        county: 'Lane', state: 'OR',
        address: '3050 N Delta Hwy, Eugene, OR 97408', phone: '(541) 682-3786',
        websiteUrl: 'https://www.lanecounty.org/government/county_departments/health_and_human_services/animal_services',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 525,
        dataYear: 2024, dataSourceName: 'Lane County AS', dataSourceUrl: 'https://www.lanecounty.org',
        countyPopulation: 382067, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 3400, priorYearEuthanized: 510, priorDataYear: 2023,
    },
];
