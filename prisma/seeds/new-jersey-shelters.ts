import type { ShelterSeedData } from './california-shelters';

export const newJerseyShelters: ShelterSeedData[] = [
    {
        name: 'Associated Humane Societies (Newark)',
        county: 'Essex', state: 'NJ',
        address: '124 Evergreen Ave, Newark, NJ 07114', phone: '(973) 824-7080',
        websiteUrl: 'https://www.ahscares.org',
        totalIntakeAnnual: 8000, totalEuthanizedAnnual: 800,
        dataYear: 2024, dataSourceName: 'AHS', dataSourceUrl: 'https://www.ahscares.org/about-us',
        countyPopulation: 863728, totalReturnedToOwner: 1000, totalTransferred: 1200,
        priorYearIntake: 7800, priorYearEuthanized: 780, priorDataYear: 2023,
    },
    {
        name: 'Camden County Animal Shelter',
        county: 'Camden', state: 'NJ',
        address: '125 County House Rd, Blackwood, NJ 08012', phone: '(856) 401-1300',
        websiteUrl: 'https://www.camdencounty.com/service/animal-shelter/',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 350,
        dataYear: 2024, dataSourceName: 'Camden County AS', dataSourceUrl: 'https://www.camdencounty.com/service/animal-shelter/',
        countyPopulation: 523485, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 3400, priorYearEuthanized: 340, priorDataYear: 2023,
    },
    {
        name: 'Bergen County Animal Shelter',
        county: 'Bergen', state: 'NJ',
        address: '100 United Ln, Teterboro, NJ 07608', phone: '(201) 229-4600',
        websiteUrl: 'https://www.co.bergen.nj.us/animal-shelter',
        totalIntakeAnnual: 2800, totalEuthanizedAnnual: 140,
        dataYear: 2024, dataSourceName: 'Bergen County AS', dataSourceUrl: 'https://www.co.bergen.nj.us/animal-shelter',
        countyPopulation: 955732, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2700, priorYearEuthanized: 135, priorDataYear: 2023,
    },
    {
        name: 'Monmouth County SPCA',
        county: 'Monmouth', state: 'NJ',
        address: '260 Wall St, Eatontown, NJ 07724', phone: '(732) 542-0040',
        websiteUrl: 'https://www.monmouthcountyspca.org',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 150,
        dataYear: 2024, dataSourceName: 'Monmouth SPCA', dataSourceUrl: 'https://www.monmouthcountyspca.org/about/',
        countyPopulation: 643615, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2900, priorYearEuthanized: 145, priorDataYear: 2023,
    },
];
