import type { ShelterSeedData } from './california-shelters';

export const marylandShelters: ShelterSeedData[] = [
    {
        name: 'Baltimore City Animal Control',
        county: 'Baltimore City', state: 'MD',
        address: '301 Stockholm St, Baltimore, MD 21230', phone: '(410) 396-4698',
        websiteUrl: 'https://humanesociety.baltimorecity.gov',
        totalIntakeAnnual: 6000, totalEuthanizedAnnual: 900,
        dataYear: 2024, dataSourceName: 'Baltimore BARCS', dataSourceUrl: 'https://www.barcs.org/about/',
        countyPopulation: 585708, totalReturnedToOwner: 700, totalTransferred: 800,
        priorYearIntake: 5800, priorYearEuthanized: 870, priorDataYear: 2023,
    },
    {
        name: 'Prince George\'s County Animal Services',
        county: 'Prince George\'s', state: 'MD',
        address: '3750 Brown Station Rd, Upper Marlboro, MD 20772', phone: '(301) 780-7200',
        websiteUrl: 'https://www.princegeorgescountymd.gov/1417/Animal-Services',
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 750,
        dataYear: 2024, dataSourceName: 'PG County AS', dataSourceUrl: 'https://www.princegeorgescountymd.gov/1417/Animal-Services',
        countyPopulation: 967201, totalReturnedToOwner: 600, totalTransferred: 700,
        priorYearIntake: 4800, priorYearEuthanized: 720, priorDataYear: 2023,
    },
    {
        name: 'Montgomery County Animal Services',
        county: 'Montgomery', state: 'MD',
        address: '7315 Muncaster Mill Rd, Derwood, MD 20855', phone: '(240) 773-5900',
        websiteUrl: 'https://www.montgomerycountymd.gov/animalservices/',
        totalIntakeAnnual: 3500, totalEuthanizedAnnual: 175,
        dataYear: 2024, dataSourceName: 'MoCo Animal Services', dataSourceUrl: 'https://www.montgomerycountymd.gov/animalservices/',
        countyPopulation: 1062061, totalReturnedToOwner: 600, totalTransferred: 500,
        priorYearIntake: 3400, priorYearEuthanized: 170, priorDataYear: 2023,
    },
];
