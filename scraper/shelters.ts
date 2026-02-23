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
import { scrapeNycAcc } from './adapters/nyc-acc';
import { scrapeMaricopa } from './adapters/maricopa';
import { scrapeWebShelter, WEB_SHELTER_CONFIGS } from './adapters/web-shelters';
import { scrapeSocrataListings, LISTING_CONFIGS } from './adapters/socrata-listings';
import { scrapeHarrisCounty } from './adapters/harris-county';

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
    /** The scraper function for this shelter */
    adapter: () => Promise<ScrapedAnimal[]>;
}

export const shelterConfigs: ShelterConfig[] = [
    // ── Direct API Adapters (most reliable) ──
    {
        id: 'la-county',
        name: 'Los Angeles County Animal Care',
        county: 'Los Angeles',
        state: 'CA',
        address: '5898 Cherry Ave, Long Beach, CA 90805',
        phone: '(562) 728-4610',
        websiteUrl: 'https://animalcare.lacounty.gov',
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
        adapter: scrapeOcAnimalCare,
    },
    // ── Custom Platform Adapters ──
    {
        id: 'nyc-acc',
        name: 'Animal Care Centers of NYC',
        county: 'New York',
        state: 'NY',
        address: '326 E 110th St, New York, NY 10029',
        phone: '(212) 788-4000',
        websiteUrl: 'https://nycacc.org',
        adapter: scrapeNycAcc,
    },
    {
        id: 'maricopa',
        name: 'Maricopa County Animal Care & Control',
        county: 'Maricopa',
        state: 'AZ',
        address: '2500 S 27th Ave, Phoenix, AZ 85009',
        phone: '(602) 506-7387',
        websiteUrl: 'https://pets.maricopa.gov',
        adapter: scrapeMaricopa,
    },
    {
        id: 'harris-county',
        name: 'Harris County Pets',
        county: 'Harris',
        state: 'TX',
        address: '612 Canino Rd, Houston, TX 77076',
        phone: '(281) 999-3191',
        websiteUrl: 'https://countypets.com',
        adapter: scrapeHarrisCounty,
    },
    // ── Web Scraper Adapters (config-driven) ──
    ...WEB_SHELTER_CONFIGS
        .filter(c => c.id !== 'maricopa' && c.id !== 'harris-county') // covered by dedicated adapters
        .map(config => ({
            id: config.id,
            name: config.shelterName,
            county: config.city,
            state: config.state,
            address: '',
            phone: '',
            websiteUrl: config.htmlUrl,
            adapter: () => scrapeWebShelter(config),
        })),
    // ── Socrata Listings (active inventory from open data portals) ──
    ...LISTING_CONFIGS.map(config => ({
        id: `socrata-${config.id}`,
        name: config.shelterName,
        county: config.city,
        state: config.state,
        address: '',
        phone: '',
        websiteUrl: `https://${config.domain}`,
        adapter: async () => {
            const { animals } = await scrapeSocrataListings({ shelterIds: [config.id] });
            return animals;
        },
    })),
];
