/**
 * Shelter Configurations
 *
 * Static configs for shelters with direct API adapters.
 * Each config maps to a shelter in the DB and includes
 * the adapter function to scrape that shelter's data.
 *
 * Data sources and stats from public records.
 */

import type { ScrapedAnimal } from './types';
import { scrapeLaCounty } from './adapters/la-county';
import { scrapeOcAnimalCare } from './adapters/oc-animal-care';

export interface ShelterConfig {
    /** Stable shelter ID (matches DB id) */
    id: string;
    /** Display name */
    name: string;
    county: string;
    state: string;
    address: string;
    phone: string;
    websiteUrl: string;
    /** Annual stats for "Live Release Rate" display */
    totalIntakeAnnual: number;
    totalEuthanizedAnnual: number;
    dataYear: number;
    dataSourceName: string;
    dataSourceUrl: string;
    /** The scraper function for this shelter */
    adapter: () => Promise<ScrapedAnimal[]>;
}

export const shelterConfigs: ShelterConfig[] = [
    {
        id: 'la-county',
        name: 'Los Angeles County Animal Care',
        county: 'Los Angeles',
        state: 'CA',
        address: '5898 Cherry Ave, Long Beach, CA 90805',
        phone: '(562) 728-4610',
        websiteUrl: 'https://animalcare.lacounty.gov',
        totalIntakeAnnual: 47500,
        totalEuthanizedAnnual: 14820,
        dataYear: 2024,
        dataSourceName: 'LA County PawStats',
        dataSourceUrl: 'https://data.lacounty.gov/datasets/animal-care-pawstats-data',
        adapter: scrapeLaCounty,
    },
    {
        id: 'oc-animal-care',
        name: 'OC Animal Care',
        county: 'Orange',
        state: 'CA',
        address: '1630 Victory Rd, Tustin, CA 92782',
        phone: '(714) 935-6848',
        websiteUrl: 'https://www.ocpetinfo.com',
        totalIntakeAnnual: 10384,
        totalEuthanizedAnnual: 1993,
        dataYear: 2024,
        dataSourceName: 'OC Animal Care Statistics',
        dataSourceUrl: 'https://www.ocpetinfo.com/about/statistics',
        adapter: scrapeOcAnimalCare,
    },
];
