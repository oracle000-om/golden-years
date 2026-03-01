/**
 * Shelter Configurations
 *
 * Shelter configs for the main scraper pipeline (`scraper/index.ts`).
 * Currently only includes Socrata open-data portals — other sources
 * (Petfinder, Adopt-a-Pet, Petango, ShelterLuv, RescueGroups)
 * have their own dedicated runner scripts.
 */

import type { ScrapedAnimal } from './types';
import { scrapeSocrataListings, LISTING_CONFIGS } from './adapters/socrata-listings';

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
