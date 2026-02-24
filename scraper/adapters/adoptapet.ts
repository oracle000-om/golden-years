/**
 * Adopt-a-Pet — Shelter Embed Scraper Adapter
 *
 * Scrapes adoptable senior animals from Adopt-a-Pet shelter pages.
 * Adopt-a-Pet is the ~largest US pet listing aggregator (~17K organizations).
 *
 * Approach:
 *   1. Shelter profiles at: https://www.adoptapet.com/shelter/{shelterId}
 *      Return structured HTML with pet cards: name, breed, sex, age, city
 *   2. Pet detail pages at: https://www.adoptapet.com/pet/{petId}-{slug}
 *      Contain og:image meta tag with high-res photo URLs
 *   3. Portable Pet List widget: https://searchtools.adoptapet.com/...
 *      Returns full pet list for a shelter (used for enumeration)
 *
 * Since we can't enumerate all 17K shelters efficiently, this adapter
 * accepts a curated list of high-volume shelter IDs to target, with
 * the capability to discover new shelters over time.
 *
 * Config: scraper/config/adoptapet-config.json
 */

import type { ScrapedAnimal } from '../types';
import { safeFetchText, isSenior, mapSex, mapSpecies, mapSize, parseAge, validatePhotoUrl } from './base-adapter';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

export interface AdoptaPetConfig {
    id: string;
    shelterName: string;
    adoptapetId: string; // numeric shelter ID on adoptapet.com
    city: string;
    state: string;
}

interface ParsedPet {
    name: string | null;
    breed: string | null;
    sex: string | null;
    age: string | null;
    city: string | null;
    petUrl: string;
    petId: string;
}

// ── Config Loading ─────────────────────────────────────

const CONFIG_PATH = join(__dirname, '../config/adoptapet-config.json');

function loadConfig(): AdoptaPetConfig[] {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as AdoptaPetConfig[];
}

// ── HTML Parsing ───────────────────────────────────────

/**
 * Parse pet listings from an Adopt-a-Pet shelter profile page.
 * The HTML contains structured pet cards with name, breed, sex/age, city.
 *
 * Card pattern in the markdown/text:
 *   [NAMEBreedSex, AgeCitySt](https://www.adoptapet.com/pet/{petId}-{slug})
 *   NAME
 *   Breed
 *   Sex, Age
 *   City, ST
 *   [Learn More](petUrl)
 */
function parseShelterPage(html: string): ParsedPet[] {
    const pets: ParsedPet[] = [];

    // Extract pet links - adoptapet URLs contain the pet ID
    const petLinkPattern = /href="(https:\/\/www\.adoptapet\.com\/pet\/(\d+)-[^"]+)"/g;
    const seenIds = new Set<string>();
    let match;

    while ((match = petLinkPattern.exec(html)) !== null) {
        const petUrl = match[1];
        const petId = match[2];
        if (seenIds.has(petId)) continue;
        seenIds.add(petId);
        pets.push({
            name: null,
            breed: null,
            sex: null,
            age: null,
            city: null,
            petUrl,
            petId,
        });
    }

    // Try to extract structured data from the HTML
    // Pattern: <a> blocks containing name, breed, and age info
    const cardPattern = /class="[^"]*"[^>]*>\s*<img[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<[^>]+>([^<]+)<\/[^>]+>\s*<[^>]+>([^<]+)<\/[^>]+>/g;

    while ((match = cardPattern.exec(html)) !== null) {
        // Alt text often contains the animal name
        const altText = match[1];
        const field1 = match[2]?.trim();
        const field2 = match[3]?.trim();

        // Try to match to a pet by URL proximity
        // This is a best-effort enhancement
    }

    return pets;
}

/**
 * Extract photo URL and metadata from a pet detail page.
 * Photos are in <img> tags within .pet-photo divs, hosted on media.adoptapet.com.
 * og:image is empty on these pages.
 */
async function fetchPetDetail(petUrl: string): Promise<{
    photoUrl: string | null;
    name: string | null;
    breed: string | null;
    sex: string | null;
    age: string | null;
    description: string | null;
} | null> {
    try {
        const html = await safeFetchText(petUrl, {
            retries: 2,
            timeoutMs: 10_000,
        });

        // Extract photo from img src within .pet-photo divs
        // Pattern: src="https://media.adoptapet.com/image/upload/.../1288672629"
        const photoMatches = html.match(/src="(https:\/\/media\.adoptapet\.com\/image\/upload\/[^"]+)"/g);
        let photoUrl: string | null = null;
        if (photoMatches && photoMatches.length > 0) {
            const srcMatch = photoMatches[0].match(/src="([^"]+)"/);
            photoUrl = srcMatch?.[1] || null;
        }

        // Fallback: try og:image if not empty
        if (!photoUrl) {
            const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i);
            if (ogMatch?.[1] && ogMatch[1].length > 5) {
                photoUrl = ogMatch[1];
            }
        }

        // Extract title for name and breed
        // Title format: " City, ST - Breed. Meet NAME a Pet for Adoption"
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch?.[1]?.trim() || null;
        let name: string | null = null;
        let breed: string | null = null;
        if (title) {
            const meetMatch = title.match(/Meet\s+(.+?)\s+a\s+Pet/i);
            if (meetMatch) name = meetMatch[1].trim();
            const breedMatch = title.match(/[-–]\s*([^.]+)\./);
            if (breedMatch) breed = breedMatch[1].trim();
        }

        // Extract age and sex from HTML text
        // Look for patterns like "Female, 7 yrs" or "Male, 10 years 3 months"
        let sex: string | null = null;
        let age: string | null = null;

        // Combined sex + age pattern
        const sexAgeMatch = html.match(/(Male|Female)\s*,?\s*(\d+)\s*(?:yrs?|years?)/i);
        if (sexAgeMatch) {
            sex = sexAgeMatch[1];
            age = `${sexAgeMatch[2]} years`;
        }

        // Try standalone age if no combined match
        if (!age) {
            const ageMatch = html.match(/>\s*(\d+)\s*(?:yrs?|years?)\s*(?:\d+\s*mos?)?\s*</i);
            if (ageMatch) age = `${ageMatch[1]} years`;
        }

        // Look for sex if not found yet
        if (!sex) {
            const sexMatch = html.match(/>\s*(Male|Female)\s*[,<]/i);
            if (sexMatch) sex = sexMatch[1];
        }

        // Extract description from meta
        const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/i);
        const description = descMatch?.[1] || null;

        return { photoUrl, name, breed, sex, age, description };
    } catch {
        return null;
    }
}

// ── Main Scraper ───────────────────────────────────────

async function fetchShelterAnimals(config: AdoptaPetConfig): Promise<ScrapedAnimal[]> {
    console.log(`   🏠 ${config.shelterName} (${config.city}, ${config.state})...`);

    // Fetch the shelter profile page to get pet links
    const shelterUrl = `https://www.adoptapet.com/shelter/${config.adoptapetId}`;
    let html: string;
    try {
        html = await safeFetchText(shelterUrl, {
            retries: 2,
            timeoutMs: 20_000,
        });
    } catch (err) {
        console.error(`   ❌ ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        return [];
    }

    // Also try to get all pages — check for pagination
    // Parse all pet links from the main page
    const petLinkPattern = /href="(https:\/\/www\.adoptapet\.com\/pet\/(\d+)-[^"]+)"/g;
    const allPetLinks: Map<string, string> = new Map(); // petId -> petUrl
    let match;
    while ((match = petLinkPattern.exec(html)) !== null) {
        allPetLinks.set(match[2], match[1]);
    }

    // Also try the portable pet list for a more complete listing
    try {
        const widgetUrl = `https://searchtools.adoptapet.com/cgi-bin/searchtools.cgi/portable_pet_list?shelter_id=${config.adoptapetId}&sort_by=pet_name&size=800x600_list`;
        const widgetHtml = await safeFetchText(widgetUrl, {
            retries: 2,
            timeoutMs: 15_000,
        });
        // Extract pet links from widget
        const widgetLinkPattern = /href="(https:\/\/(?:searchtools\.adoptapet\.com|www\.adoptapet\.com)\/pet\/(\d+)-[^"]+)"/g;
        while ((match = widgetLinkPattern.exec(widgetHtml)) !== null) {
            const url = match[1].replace('searchtools.adoptapet.com', 'www.adoptapet.com');
            allPetLinks.set(match[2], url);
        }
    } catch { /* Widget not critical */ }

    console.log(`      Found ${allPetLinks.size} pet listings`);

    // Quick pre-filter: extract age from shelter page text to avoid unnecessary detail fetches
    // Parse structured text blocks: "NAMEBreedSex, AgeCity, ST"
    const ageInfoPattern = /(\d+)\s*(?:yrs?|years?)\s*(?:\d+\s*mos?)?/gi;
    const textBlocks = html.match(/(?:Male|Female)[^<]{0,30}(?:\d+\s*(?:yrs?|years?))/gi) || [];

    // Fetch details for each pet (with rate limiting)
    const animals: ScrapedAnimal[] = [];
    const petEntries = Array.from(allPetLinks.entries());
    let detailsFetched = 0;

    for (const [petId, petUrl] of petEntries) {
        // Rate limit: 500ms between requests
        if (detailsFetched > 0) {
            await new Promise(r => setTimeout(r, 500));
        }

        const detail = await fetchPetDetail(petUrl);
        detailsFetched++;

        if (!detail || !detail.photoUrl) continue;

        // Parse age
        const ageYears = parseAge(detail.age);
        const species = mapSpecies(detail.breed); // Infer from breed if no explicit species

        // Better species detection from breed string
        const breedLower = (detail.breed || '').toLowerCase();
        const resolvedSpecies: 'DOG' | 'CAT' | 'OTHER' =
            breedLower.includes('shorthair') || breedLower.includes('longhair') ||
                breedLower.includes('siamese') || breedLower.includes('tabby') ||
                breedLower.includes('persian') || breedLower.includes('calico') ||
                breedLower.includes('domestic') && breedLower.includes('hair') ? 'CAT'
                : breedLower.includes('terrier') || breedLower.includes('retriever') ||
                    breedLower.includes('shepherd') || breedLower.includes('bulldog') ||
                    breedLower.includes('poodle') || breedLower.includes('husky') ||
                    breedLower.includes('beagle') || breedLower.includes('chihuahua') ||
                    breedLower.includes('pit bull') || breedLower.includes('labrador') ||
                    breedLower.includes('dachshund') || breedLower.includes('corgi') ||
                    breedLower.includes('collie') || breedLower.includes('hound') ||
                    breedLower.includes('boxer') || breedLower.includes('mastiff') ||
                    breedLower.includes('rottweiler') || breedLower.includes('malinois') ? 'DOG'
                    : 'OTHER';

        if (!isSenior(ageYears, resolvedSpecies)) continue;

        animals.push({
            intakeId: `AAP-${config.id}-${petId}`,
            name: detail.name || null,
            species: resolvedSpecies,
            breed: detail.breed || null,
            sex: mapSex(detail.sex),
            size: null,
            photoUrl: detail.photoUrl,
            status: 'AVAILABLE',
            ageKnownYears: ageYears,
            ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
            euthScheduledAt: null,
            intakeDate: null,
            notes: detail.description || null,
            intakeReason: 'UNKNOWN',
            intakeReasonDetail: null,
            _shelterId: `adoptapet-${config.id}`,
            _shelterName: config.shelterName,
            _shelterCity: config.city,
            _shelterState: config.state,
        });

        // Progress indicator for large shelters
        if (detailsFetched % 25 === 0) {
            console.log(`      ... ${detailsFetched}/${petEntries.length} details fetched, ${animals.length} seniors found`);
        }
    }

    console.log(`      Seniors with photos: ${animals.length} (from ${detailsFetched} details fetched)`);
    return animals;
}

// ── Public API ─────────────────────────────────────────

export interface AdoptaPetScrapeResult {
    animals: ScrapedAnimal[];
    shelters: Map<string, { name: string; city: string; state: string }>;
}

export async function scrapeAdoptaPet(opts?: {
    shelterIds?: string[];
}): Promise<AdoptaPetScrapeResult> {
    const configs = loadConfig();
    const filtered = opts?.shelterIds
        ? configs.filter(c => opts.shelterIds!.includes(c.id))
        : configs;

    if (filtered.length === 0) {
        console.warn('   ⚠ No Adopt-a-Pet shelters configured. Check adoptapet-config.json');
        return { animals: [], shelters: new Map() };
    }

    const allAnimals: ScrapedAnimal[] = [];
    const shelterMap = new Map<string, { name: string; city: string; state: string }>();

    for (const config of filtered) {
        shelterMap.set(`adoptapet-${config.id}`, {
            name: config.shelterName,
            city: config.city,
            state: config.state,
        });

        try {
            const animals = await fetchShelterAnimals(config);
            allAnimals.push(...animals);
        } catch (err) {
            console.error(`   ❌ ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        }

        // Rate limit between shelters (2s — be polite)
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`   Total Adopt-a-Pet seniors: ${allAnimals.length} from ${shelterMap.size} shelters`);
    return { animals: allAnimals, shelters: shelterMap };
}

export { loadConfig as loadAdoptaPetConfig };
