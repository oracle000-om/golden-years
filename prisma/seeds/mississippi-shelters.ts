import type { ShelterSeedData } from './california-shelters';

export const mississippiShelters: ShelterSeedData[] = [
    {
        name: 'Jackson Animal Shelter',
        county: 'Hinds', state: 'MS',
        address: '140 Outer Dr, Jackson, MS 39209', phone: '(601) 960-0471',
        websiteUrl: null,
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 2500,
        dataYear: 2024, dataSourceName: 'City of Jackson', dataSourceUrl: 'https://www.jacksonms.gov',
        countyPopulation: 231840, totalReturnedToOwner: 300, totalTransferred: 400,
        priorYearIntake: 4800, priorYearEuthanized: 2448, priorDataYear: 2023,
    },
    {
        name: 'Harrison County Animal Control',
        county: 'Harrison', state: 'MS',
        address: '13032 Isaac Dr, Gulfport, MS 39503', phone: '(228) 863-3254',
        websiteUrl: 'https://www.co.harrison.ms.us/animal-control',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 1400,
        dataYear: 2024, dataSourceName: 'Harrison County AC', dataSourceUrl: 'https://www.co.harrison.ms.us/animal-control',
        countyPopulation: 208080, totalReturnedToOwner: 250, totalTransferred: 300,
        priorYearIntake: 3400, priorYearEuthanized: 1394, priorDataYear: 2023,
    },
    {
        name: 'DeSoto County Animal Shelter',
        county: 'DeSoto', state: 'MS',
        address: '2625 Rasco Rd W, Southaven, MS 38671', phone: '(662) 429-0208',
        websiteUrl: 'https://www.desotocountyms.gov/188/Animal-Services',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 900,
        dataYear: 2024, dataSourceName: 'DeSoto County AS', dataSourceUrl: 'https://www.desotocountyms.gov/188/Animal-Services',
        countyPopulation: 184945, totalReturnedToOwner: 300, totalTransferred: 350,
        priorYearIntake: 2900, priorYearEuthanized: 870, priorDataYear: 2023,
    },
];
