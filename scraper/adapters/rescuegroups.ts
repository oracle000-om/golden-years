/**
 * RescueGroups.org — Universal Scraper Adapter
 *
 * Uses RescueGroups.org API v5 to fetch adoptable senior animals
 * from shelters across the entire US. One adapter replaces all
 * individual shelter scrapers.
 *
 * API: POST https://api.rescuegroups.org/v5/public/animals/search
 * Docs: https://api.rescuegroups.org/v5/public/docs
 * Auth: API key in Authorization header (free, register at rescuegroups.org)
 *
 * Env: RESCUEGROUPS_API_KEY
 */

import type { ScrapedAnimal } from '../types';

const API_BASE = 'https://api.rescuegroups.org/v5/public/animals/search/available';
const PAGE_LIMIT = 100; // max per page

/** Shape of included pictures in the response */
interface RGPicture {
    type: 'pictures';
    id: string;
    attributes: {
        original: { url: string; resolutionX: number; resolutionY: number } | null;
        large: { url: string; resolutionX: number; resolutionY: number } | null;
        small: { url: string; resolutionX: number; resolutionY: number } | null;
    };
}

/** Shape of included orgs in the response */
interface RGOrg {
    type: 'orgs';
    id: string;
    attributes: {
        name: string;
        citystate: string;
        state: string;
        city: string;
        postalcode: string;
        phone: string | null;
        url: string | null;
    };
}

/** Shape of an animal in the response */
interface RGAnimal {
    type: 'animals';
    id: string;
    attributes: {
        name: string | null;
        species: string;          // "Dog", "Cat", etc.
        breedPrimary: string | null;
        breedSecondary: string | null;
        breedString: string | null;
        sex: string;              // "Male", "Female", "Unknown"
        ageGroup: string;         // "Baby", "Young", "Adult", "Senior"
        ageString: string | null; // e.g., "10 years"
        sizeGroup: string | null; // "Small", "Medium", "Large", "X-Large"
        descriptionText: string | null;
        pictureThumbnailUrl: string | null;
        birthDate: string | null; // ISO date
        adoptedDate: string | null;
        foundDate: string | null;
        isSpecialNeeds: boolean;
        isSenior: boolean;
    };
    relationships: {
        orgs: { data: Array<{ type: string; id: string }> };
        pictures: { data: Array<{ type: string; id: string }> };
    };
}

interface RGResponse {
    data: RGAnimal[];
    included: Array<RGPicture | RGOrg>;
    meta: {
        count: number;
        countReturned: number;
        pageReturned: number;
        pages: number;
        limit: number;
        transactionId: string;
    };
}

function mapSex(sex: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    const s = sex?.toLowerCase();
    if (s === 'male') return 'MALE';
    if (s === 'female') return 'FEMALE';
    return 'UNKNOWN';
}

function mapSpecies(species: string): 'DOG' | 'CAT' | 'OTHER' {
    const s = species?.toLowerCase();
    if (s === 'dog') return 'DOG';
    if (s === 'cat') return 'CAT';
    return 'OTHER';
}

function mapSize(size: string | null): 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null {
    if (!size) return null;
    const s = size.toLowerCase();
    if (s.includes('small')) return 'SMALL';
    if (s.includes('medium')) return 'MEDIUM';
    if (s.includes('large') && !s.includes('x-large') && !s.includes('extra')) return 'LARGE';
    if (s.includes('x-large') || s.includes('extra large') || s.includes('xlarge')) return 'XLARGE';
    return null;
}

function parseAgeFromString(ageString: string | null): number | null {
    if (!ageString) return null;
    const match = ageString.match(/(\d+)\s*year/i);
    return match ? parseInt(match[1], 10) : null;
}

/** Keywords that indicate a rescue/foster org rather than a municipal shelter */
const RESCUE_KEYWORDS = [
    'rescue', 'foster', 'refuge', 'sanctuary', 'haven',
    'friends of', 'best friends', 'saving', 'second chance',
    'forever home', 'paws of', 'angels', 'guardian',
];

/** Returns true if the org name suggests a private rescue, not a public shelter */
function isLikelyRescueOrg(name: string): boolean {
    const lower = name.toLowerCase();
    return RESCUE_KEYWORDS.some(kw => lower.includes(kw));
}

function getAllPhotoUrls(
    animal: RGAnimal,
    includedMap: Map<string, RGPicture | RGOrg>,
): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    // Collect high-res included pictures
    const picRefs = animal.relationships?.pictures?.data || [];
    for (const ref of picRefs) {
        const pic = includedMap.get(`pictures:${ref.id}`) as RGPicture | undefined;
        if (pic) {
            const url = pic.attributes.large?.url
                || pic.attributes.original?.url
                || pic.attributes.small?.url
                || null;
            if (url && !seen.has(url)) {
                seen.add(url);
                urls.push(url);
            }
        }
    }

    // Fall back to thumbnail if no included pictures
    if (urls.length === 0 && animal.attributes.pictureThumbnailUrl) {
        urls.push(animal.attributes.pictureThumbnailUrl);
    }

    return urls;
}

function getOrg(
    animal: RGAnimal,
    includedMap: Map<string, RGPicture | RGOrg>,
): RGOrg | null {
    const orgRefs = animal.relationships?.orgs?.data || [];
    for (const ref of orgRefs) {
        const org = includedMap.get(`orgs:${ref.id}`) as RGOrg | undefined;
        if (org) return org;
    }
    return null;
}

export interface ScrapeOptions {
    /** Two-letter state code filter, e.g. 'CA', 'TX'. If omitted, searches all states. */
    state?: string;
    /** Postal code for location-based search */
    postalCode?: string;
    /** Radius in miles (used with postalCode) */
    miles?: number;
}

export async function scrapeRescueGroups(options: ScrapeOptions = {}): Promise<{
    animals: ScrapedAnimal[];
    shelters: Map<string, { name: string; city: string; state: string; phone: string | null; url: string | null }>;
}> {
    const apiKey = process.env.RESCUE_GROUPS_API_KEY;
    if (!apiKey) {
        throw new Error('RESCUE_GROUPS_API_KEY not set. Register free at https://rescuegroups.org/services/adoptable-pet-data-api/');
    }

    const allAnimals: ScrapedAnimal[] = [];
    const shelterMap = new Map<string, { name: string; city: string; state: string; phone: string | null; url: string | null }>();

    // Search for both dogs and cats
    for (const species of ['dogs', 'cats'] as const) {
        let page = 1;
        let totalPages = 1;
        let speciesTotal = 0;

        console.log(`   Fetching senior ${species}...`);

        while (page <= totalPages) {
            const url = new URL(`${API_BASE}/${species}`);
            url.searchParams.set('limit', PAGE_LIMIT.toString());
            url.searchParams.set('page', page.toString());
            url.searchParams.set('include', 'orgs,pictures');
            url.searchParams.set('fields[animals]',
                'name,species,breedPrimary,breedSecondary,breedString,sex,ageGroup,ageString,sizeGroup,descriptionText,pictureThumbnailUrl,birthDate,foundDate,isSpecialNeeds,isSenior'
            );
            url.searchParams.set('fields[orgs]', 'name,citystate,state,city,postalcode,phone,url');

            // Build filter body — fetch seniors from ALL org types (shelters, rescues, sanctuaries, etc.)
            const filters: Array<{ fieldName: string; operation: string; criteria: string }> = [
                { fieldName: 'animals.ageGroup', operation: 'equals', criteria: 'Senior' },
            ];

            // Location filters
            const filterRadius: Record<string, unknown> = {};
            if (options.postalCode) {
                filterRadius.postalcode = options.postalCode;
                filterRadius.miles = options.miles || 200;
            }
            if (options.state) {
                filters.push({ fieldName: 'orgs.state', operation: 'equals', criteria: options.state });
            }

            const body: Record<string, unknown> = {
                data: {
                    filters,
                    ...(Object.keys(filterRadius).length > 0 ? { filterRadius } : {}),
                },
            };

            try {
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/vnd.api+json',
                        'Authorization': apiKey,
                    },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API ${response.status}: ${errorText.substring(0, 200)}`);
                }

                const json = await response.json() as RGResponse;

                // Update pagination
                if (page === 1) {
                    totalPages = json.meta?.pages || 1;
                    console.log(`   ${species.toUpperCase()}: ${json.meta?.count || 0} senior animals across ${totalPages} pages`);
                }

                // Build lookup map for included resources
                const includedMap = new Map<string, RGPicture | RGOrg>();
                for (const inc of (json.included || [])) {
                    includedMap.set(`${inc.type}:${inc.id}`, inc);
                }

                // Process animals
                for (const animal of json.data) {
                    const attrs = animal.attributes;

                    // Parse age
                    const ageYears = parseAgeFromString(attrs.ageString);

                    // Get all photos
                    const allPhotos = getAllPhotoUrls(animal, includedMap);
                    const photoUrl = allPhotos[0] || null;
                    const photoUrls = allPhotos.slice(1);

                    // Get organization
                    const org = getOrg(animal, includedMap);
                    if (!org) continue;
                    if (!shelterMap.has(org.id)) {
                        shelterMap.set(org.id, {
                            name: org.attributes.name,
                            city: org.attributes.city,
                            state: org.attributes.state,
                            phone: org.attributes.phone,
                            url: org.attributes.url,
                        });
                    }

                    // Build breed string
                    const breed = [attrs.breedPrimary, attrs.breedSecondary].filter(Boolean).join(' / ') || attrs.breedString || null;

                    // Derive species from the API endpoint we're hitting ('dogs'→'DOG', 'cats'→'CAT')
                    // rather than attrs.species, which may be undefined on species-specific endpoints.
                    const resolvedSpecies: 'DOG' | 'CAT' | 'OTHER' = species === 'dogs' ? 'DOG'
                        : species === 'cats' ? 'CAT'
                            : mapSpecies(attrs.species);

                    const scraped: ScrapedAnimal = {
                        intakeId: animal.id,
                        name: attrs.name || null,
                        species: resolvedSpecies,
                        breed,
                        sex: mapSex(attrs.sex),
                        size: mapSize(attrs.sizeGroup),
                        photoUrl,
                        photoUrls,
                        status: attrs.isSpecialNeeds ? 'URGENT' : 'AVAILABLE',
                        ageKnownYears: ageYears,
                        ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
                        euthScheduledAt: null,
                        intakeDate: attrs.foundDate ? new Date(attrs.foundDate) : null,
                        notes: attrs.descriptionText || null,
                        intakeReason: 'UNKNOWN',
                        intakeReasonDetail: null,
                        // Shelter info for dynamic shelter creation
                        _shelterId: org ? `rg-${org.id}` : null,
                        _shelterName: org?.attributes.name || null,
                        _shelterCity: org?.attributes.city || null,
                        _shelterState: org?.attributes.state || null,
                    };

                    allAnimals.push(scraped);
                    speciesTotal++;
                }

                page++;

                // Rate limit: small delay between pages
                if (page <= totalPages) {
                    await new Promise(r => setTimeout(r, 250));
                }
            } catch (error) {
                console.error(`   Error on page ${page}: ${(error as Error).message}`);
                break;
            }
        }

        console.log(`   ${species.toUpperCase()}: ${speciesTotal} seniors fetched`);
    }

    console.log(`   Total seniors found: ${allAnimals.length} from ${shelterMap.size} shelters`);
    return { animals: allAnimals, shelters: shelterMap };
}
