import type { ShelterSeedData } from './california-shelters';

export const massachusettsShelters: ShelterSeedData[] = [
    {
        name: 'MSPCA-Angell (Boston)',
        county: 'Suffolk', state: 'MA',
        address: '350 S Huntington Ave, Boston, MA 02130', phone: '(617) 522-7400',
        websiteUrl: 'https://www.mspca.org',
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 250,
        dataYear: 2024, dataSourceName: 'MSPCA-Angell', dataSourceUrl: 'https://www.mspca.org/about-us/',
        countyPopulation: 797936, totalReturnedToOwner: 700, totalTransferred: 800,
        priorYearIntake: 4800, priorYearEuthanized: 240, priorDataYear: 2023,
    },
    {
        name: 'Animal Rescue League of Boston',
        county: 'Suffolk', state: 'MA',
        address: '10 Chandler St, Boston, MA 02116', phone: '(617) 426-9170',
        websiteUrl: 'https://www.arlboston.org',
        totalIntakeAnnual: 4000, totalEuthanizedAnnual: 200,
        dataYear: 2024, dataSourceName: 'ARL Boston', dataSourceUrl: 'https://www.arlboston.org/about/',
        countyPopulation: 797936, totalReturnedToOwner: 500, totalTransferred: 600,
        priorYearIntake: 3900, priorYearEuthanized: 195, priorDataYear: 2023,
    },
    {
        name: 'Worcester Animal Rescue League',
        county: 'Worcester', state: 'MA',
        address: '139 Holden St, Worcester, MA 01606', phone: '(508) 853-0030',
        websiteUrl: 'https://www.worcesterarl.org',
        totalIntakeAnnual: 2500, totalEuthanizedAnnual: 125,
        dataYear: 2024, dataSourceName: 'Worcester ARL', dataSourceUrl: 'https://www.worcesterarl.org/about/',
        countyPopulation: 862111, totalReturnedToOwner: 400, totalTransferred: 350,
        priorYearIntake: 2400, priorYearEuthanized: 120, priorDataYear: 2023,
    },
];
