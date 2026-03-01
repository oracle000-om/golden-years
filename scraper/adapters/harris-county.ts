/**
 * Harris County Pets — Custom Adapter
 *
 * Harris County Animal Shelter (Houston, TX) uses two data sources:
 *   1. 24PetConnect (Petango) for adoptable animal listings
 *   2. ArcGIS VPH Data Hub for shelter statistics
 *
 * This adapter scrapes the 24PetConnect listing pages for adoptable
 * senior animals and enriches shelter records with ArcGIS stats.
 *
 * Listings: https://24petconnect.com/HarrisCountyAdoptablePets
 * ArcGIS Stats: https://services.arcgis.com/su8ic9KbA7PYVxPS/ArcGIS/rest/services/VPHDataHub2024Tables
 */

import type { ScrapedAnimal } from '../types';
import { safeFetchText, safeFetchJSON, classifyAgeSegment, mapSex, mapSpecies, mapSize, parseAge } from './base-adapter';

// ── Constants ──────────────────────────────────────────

const PETCONNECT_BASE = 'https://24petconnect.com/HarrisCountyAdoptablePets';
const ARCGIS_BASE = 'https://services.arcgis.com/su8ic9KbA7PYVxPS/ArcGIS/rest/services/VPHDataHub2024Tables/FeatureServer';

// ── 24PetConnect Scraper ───────────────────────────────

interface PetConnectAnimal {
    id: string;
    shelterCode: string;
    name: string;
    species: string;
    breed: string;
    sex: string;
    age: string;
    photoUrl: string | null;
}

/**
 * Parse animals from 24PetConnect SSR HTML listing pages.
 * 
 * Animal cards are `.gridResult` divs with onclick handlers like:
 *   onclick="Details('HarrisCountyAdoptablePets', 'HRRS', 'A651044')"
 * 
 * Images use the proxy pattern: https://24petconnect.com/image/{internalId}
 * Pagination: ?index=0, ?index=30, ?index=60 (30 per page)
 */
function parseAnimalCards(html: string): PetConnectAnimal[] {
    const animals: PetConnectAnimal[] = [];

    // Match onclick="Details('HarrisCountyAdoptablePets', 'HRRS', 'A651044')"
    const detailsRegex = /Details\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
    const foundIds = new Set<string>();

    let match;
    while ((match = detailsRegex.exec(html)) !== null) {
        const shelterCode = match[2]; // e.g., 'HRRS'
        const animalId = match[3];    // e.g., 'A651044'
        if (foundIds.has(animalId)) continue;
        foundIds.add(animalId);

        // Extract data from the surrounding card context (typically ~1500 chars around the match)
        const cardContext = extractCardContext(html, match.index, 1500);

        // Name — usually in a heading or strong tag near the card
        const name = extractFromContext(cardContext, /<(?:b|strong|h\d)[^>]*>\s*([A-Za-z][A-Za-z\s'-]+?)\s*<\/(?:b|strong|h\d)>/i) ||
            extractFromContext(cardContext, /class="[^"]*(?:name|title)[^"]*"[^>]*>([^<]+)/i) ||
            'Unknown';

        // Species — look for Dog/Cat mentions
        const speciesRaw = extractFromContext(cardContext, /(?:species|animal\s*type)[:\s]*([^<,]+)/i) ||
            extractFromContext(cardContext, /(Dog|Cat|Rabbit|Bird|Guinea Pig)/i) || '';

        // Breed — field label or content
        const breed = extractFromContext(cardContext, /(?:breed|Primary Breed)[:\s</]*>?\s*([^<]+)/i) ||
            extractFromContext(cardContext, /(?:Breed)[:\s]*([^<,;]+)/i) || '';

        // Sex — look for Male/Female/Neutered/Spayed
        const sex = extractFromContext(cardContext, /(?:sex|gender)[:\s</]*>?\s*([^<]+)/i) ||
            extractFromContext(cardContext, /(Male|Female|Neutered Male|Spayed Female|Unknown)/i) || '';

        // Age — look for age patterns
        const age = extractFromContext(cardContext, /(?:age)[:\s</]*>?\s*([^<]+)/i) ||
            extractFromContext(cardContext, /(\d+\s+(?:year|yr|month|mon|week|wk)s?(?:\s+\d+\s+(?:month|mon|week|wk)s?)?)/i) || '';

        // Photo URL — 24PetConnect uses /image/{internalId} proxy or g.petango.com
        let photoUrl: string | null = null;
        const imgMatch = cardContext.match(/src\s*=\s*["'](https?:\/\/24petconnect\.com\/image\/[^"']+)["']/i) ||
            cardContext.match(/src\s*=\s*["'](https?:\/\/g\.petango\.com[^"']+)["']/i) ||
            cardContext.match(/src\s*=\s*["'](\/image\/[^"']+)["']/i) ||
            cardContext.match(/data-src\s*=\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|webp)[^"']*)["']/i);

        if (imgMatch) {
            photoUrl = imgMatch[1];
            // Make relative URLs absolute
            if (photoUrl.startsWith('/')) {
                photoUrl = `https://24petconnect.com${photoUrl}`;
            }
        }

        // Skip placeholder/no-photo images
        if (photoUrl && (photoUrl.includes('noimage') || photoUrl.includes('nophoto') || photoUrl.includes('placeholder') || photoUrl.includes('NoImageAvailable'))) {
            photoUrl = null;
        }

        animals.push({
            id: animalId,
            shelterCode,
            name: name.trim().replace(/\s+/g, ' '),
            species: speciesRaw.trim(),
            breed: breed.trim(),
            sex: sex.trim(),
            age: age.trim(),
            photoUrl,
        });
    }

    return animals;
}

function extractCardContext(html: string, position: number, radius: number): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(html.length, position + radius);
    return html.substring(start, end);
}

function extractFromContext(context: string, regex: RegExp): string | null {
    const m = context.match(regex);
    return m ? m[1].trim() : null;
}

/**
 * Scrape all pages of the 24PetConnect listing.
 * Pagination uses ?index=0, ?index=30, ?index=60 etc (30 per page).
 */
async function scrapeAllPages(): Promise<PetConnectAnimal[]> {
    const allAnimals: PetConnectAnimal[] = [];
    const perPage = 30;
    let index = 0;
    const maxPages = 20; // Safety limit (600 animals max)

    for (let page = 0; page < maxPages; page++) {
        const url = index === 0 ? PETCONNECT_BASE : `${PETCONNECT_BASE}?index=${index}`;
        console.log(`      Page ${page + 1} (index=${index})...`);

        try {
            const html = await safeFetchText(url, {
                retries: 2,
                timeoutMs: 20_000,
            });

            const animals = parseAnimalCards(html);
            if (animals.length === 0) break; // No more pages

            allAnimals.push(...animals);

            // Check if there are more pages
            const hasNext = html.includes(`index=${index + perPage}`) ||
                html.includes('Next') ||
                animals.length >= perPage;

            if (!hasNext || animals.length < perPage) break;

            index += perPage;
            await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch (err) {
            console.error(`      ❌ Page ${page + 1}: ${(err as Error).message?.substring(0, 80)}`);
            break;
        }
    }

    return allAnimals;
}

// ── ArcGIS Stats ───────────────────────────────────────

export interface HarrisCountyStats {
    adoptionsByMonth: { month: string; dogs: number; cats: number }[];
    euthanasiaRateByMonth: { month: string; dogs: number; cats: number }[];
    liveReleaseRateByMonth: { month: string; dogs: number; cats: number }[];
    shelterPopulationByMonth: { month: string; dogs: number; cats: number }[];
}

async function fetchArcGISTable(tableId: number): Promise<{ month: string; dogs: number; cats: number }[]> {
    const url = `${ARCGIS_BASE}/${tableId}/query?where=1%3D1&outFields=*&f=json&resultRecordCount=100`;
    try {
        const data = await safeFetchJSON<{
            features?: { attributes: { Month?: string; Dogs?: number; Cats?: number } }[];
        }>(url, { retries: 2, timeoutMs: 15_000 });

        return (data.features || []).map(f => ({
            month: f.attributes.Month || '',
            dogs: f.attributes.Dogs || 0,
            cats: f.attributes.Cats || 0,
        }));
    } catch {
        return [];
    }
}

export async function fetchHarrisCountyStats(): Promise<HarrisCountyStats> {
    const [adoptions, euthanasia, liveRelease, population] = await Promise.all([
        fetchArcGISTable(0),  // AnimalsAdopted2024
        fetchArcGISTable(6),  // EuthanasiaRate2024
        fetchArcGISTable(9),  // LiveReleaseRate2024
        fetchArcGISTable(2),  // AnimalShelter2024 (population)
    ]);

    return {
        adoptionsByMonth: adoptions,
        euthanasiaRateByMonth: euthanasia,
        liveReleaseRateByMonth: liveRelease,
        shelterPopulationByMonth: population,
    };
}

// ── Main Scraper ───────────────────────────────────────

/** Extract animal details from a 24PetConnect detail page */
function parseDetailPage(html: string, animalId: string): {
    name: string | null;
    species: string;
    breed: string | null;
    sex: string;
    age: string;
    photoUrl: string | null;
    weight: string | null;
    notes: string | null;
} | null {
    // Age: "The shelter staff think I am about 2 years old."
    const ageMatch = html.match(/text_Age[^>]*>([^<]+)/i);
    const ageRaw = ageMatch ? ageMatch[1].trim() : '';

    // Photo from og:image meta
    const photoMatch = html.match(/og:image['"]\s*content\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
    let photoUrl = photoMatch ? photoMatch[1] : null;
    if (photoUrl && (photoUrl.includes('NoImageAvailable') || photoUrl.includes('noimage'))) photoUrl = null;

    // Description contains species/breed: "I look like a black and white Pit Bull Terrier / Labrador Retriever."
    const descMatch = html.match(/text_Description[^>]*>([\s\S]*?)<\/span>/i);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';

    // Extract breed from description: "I look like a [color] [breed]"
    const breedMatch = desc.match(/look like (?:a|an)\s+(?:[a-z]+(?:\s+and\s+[a-z]+)?\s+)?(.+?)(?:\.|$)/i);
    let breed = breedMatch ? breedMatch[1].trim() : null;
    // Clean up breed: strip leading color words and connectors
    if (breed) {
        breed = breed.replace(/^(?:\/\s*|and\s+)/i, '').trim();
    }

    // Species: check for cat/dog in description or in the type filter
    let species = 'OTHER';
    if (/(?:dog|canine|puppy)/i.test(desc) || /(?:Terrier|Retriever|Shepherd|Hound|Bulldog|Boxer|Beagle|Husky|Pit Bull|Chihuahua|Poodle|Dachshund|Mastiff|Collie)/i.test(desc)) {
        species = 'DOG';
    } else if (/(?:cat|kitten|feline)/i.test(desc) || /(?:Domestic|Shorthair|Longhair|Siamese|Persian|Tabby|Bengal|Maine Coon)/i.test(desc)) {
        species = 'CAT';
    }

    // Sex from description
    const sexMatch = desc.match(/I am (male|female)/i) || html.match(/text_Gender[^>]*>([^<]+)/i);
    const sex = sexMatch ? sexMatch[1].trim() : '';

    // Weight
    const weightMatch = html.match(/I weigh ([\d.]+)\s*pounds/i);
    const weight = weightMatch ? `${weightMatch[1]} lbs` : null;

    // Name — og:title gives "Details: A651044", which is the intake ID
    // Harris County animals typically use intake IDs as names so we keep them
    const nameMatch = html.match(/og:title['"]\s*content\s*=\s*['"]Details:\s*([^'"]+)/i);
    const name = nameMatch ? nameMatch[1].trim() : animalId;

    return { name, species, breed, sex, age: ageRaw, photoUrl, weight, notes: desc || null };
}

export async function scrapeHarrisCounty(): Promise<ScrapedAnimal[]> {
    console.log('   🏠 Harris County Pets (Houston, TX)...');
    console.log('      Phase 1: Collecting animal IDs from listing pages...');

    const raw = await scrapeAllPages();
    console.log(`      Found ${raw.length} animal IDs`);

    if (raw.length === 0) {
        console.warn('      ⚠ No animals found on listing pages');
        return [];
    }

    // Phase 2: Fetch detail pages concurrently to get age/breed/photo
    console.log(`      Phase 2: Fetching detail pages (concurrency=10)...`);
    const DETAIL_CONCURRENCY = 10;
    const animals: ScrapedAnimal[] = [];
    let detailsFetched = 0;


    async function fetchDetail(r: PetConnectAnimal): Promise<void> {
        const detailUrl = `https://24petconnect.com/HarrisCountyAdoptablePets/Details/${r.shelterCode}/${r.id}`;
        try {
            const html = await safeFetchText(detailUrl, { retries: 1, timeoutMs: 10_000 });
            detailsFetched++;

            const detail = parseDetailPage(html, r.id);
            if (!detail) return;

            const species = mapSpecies(detail.species);
            const ageYears = parseAge(detail.age);

            animals.push({
                intakeId: r.id,
                name: detail.name || r.name || null,
                species,
                breed: detail.breed || null,
                sex: mapSex(detail.sex || r.sex),
                size: mapSize(detail.weight || ''),
                photoUrl: detail.photoUrl,
                status: 'AVAILABLE',
                ageKnownYears: ageYears,
                ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
                euthScheduledAt: null,
                intakeDate: null,
                notes: detail.notes,
                intakeReason: 'UNKNOWN',
                intakeReasonDetail: null,
                ageSegment: classifyAgeSegment(ageYears, species),
            });
        } catch {
            // Non-fatal — skip this animal
        }
    }

    for (let i = 0; i < raw.length; i += DETAIL_CONCURRENCY) {
        const batch = raw.slice(i, i + DETAIL_CONCURRENCY);
        await Promise.allSettled(batch.map(r => fetchDetail(r)));

        if ((i + DETAIL_CONCURRENCY) % 100 < DETAIL_CONCURRENCY || i + DETAIL_CONCURRENCY >= raw.length) {
            console.log(`      ... ${Math.min(i + DETAIL_CONCURRENCY, raw.length)}/${raw.length} details (${animals.length} animals so far)`);
        }

        await new Promise(r => setTimeout(r, 300)); // Rate limit between batches
    }

    console.log(`      Total animals: ${animals.length} (${animals.filter(a => a.photoUrl).length} with photos)`);

    // Fetch and log stats
    console.log('      Fetching ArcGIS shelter stats...');
    const stats = await fetchHarrisCountyStats();
    const totalAdoptions = stats.adoptionsByMonth.reduce((sum, m) => sum + m.dogs + m.cats, 0);
    console.log(`      📊 YTD Adoptions: ${totalAdoptions} | Population data: ${stats.shelterPopulationByMonth.length} months`);

    return animals;
}
