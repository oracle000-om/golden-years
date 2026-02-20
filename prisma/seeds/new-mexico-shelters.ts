import type { ShelterSeedData } from './california-shelters';

export const newMexicoShelters: ShelterSeedData[] = [
    {
        name: 'Albuquerque Animal Welfare Department',
        county: 'Bernalillo', state: 'NM',
        address: '8920 Lomas Blvd NE, Albuquerque, NM 87112', phone: '(505) 768-1975',
        websiteUrl: 'https://www.cabq.gov/animal-welfare',
        totalIntakeAnnual: 12000, totalEuthanizedAnnual: 1800,
        dataYear: 2024, dataSourceName: 'ABQ Animal Welfare', dataSourceUrl: 'https://www.cabq.gov/animal-welfare',
        countyPopulation: 676685, totalReturnedToOwner: 1500, totalTransferred: 1800,
        priorYearIntake: 11500, priorYearEuthanized: 1840, priorDataYear: 2023,
    },
    {
        name: 'Santa Fe Animal Shelter & Humane Society',
        county: 'Santa Fe', state: 'NM',
        address: '100 Caja Del Rio Rd, Santa Fe, NM 87507', phone: '(505) 983-4309',
        websiteUrl: 'https://sfhumanesociety.org',
        totalIntakeAnnual: 3000, totalEuthanizedAnnual: 150,
        dataYear: 2024, dataSourceName: 'SF Animal Shelter', dataSourceUrl: 'https://sfhumanesociety.org/about/',
        countyPopulation: 154823, totalReturnedToOwner: 500, totalTransferred: 400,
        priorYearIntake: 2900, priorYearEuthanized: 145, priorDataYear: 2023,
    },
    {
        name: 'Doña Ana County Animal Control',
        county: 'Doña Ana', state: 'NM',
        address: '3551 Bataan Memorial W, Las Cruces, NM 88012', phone: '(575) 382-0018',
        websiteUrl: 'https://www.donaanacounty.org/animal',
        totalIntakeAnnual: 5000, totalEuthanizedAnnual: 1250,
        dataYear: 2024, dataSourceName: 'Doña Ana County AC', dataSourceUrl: 'https://www.donaanacounty.org/animal',
        countyPopulation: 219561, totalReturnedToOwner: 400, totalTransferred: 500,
        priorYearIntake: 4800, priorYearEuthanized: 1248, priorDataYear: 2023,
    },
];
