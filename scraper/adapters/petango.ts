/**
 * Petango / 24PetConnect — Platform Adapter
 *
 * Uses the Petango SOAP/REST web service to fetch adoptable senior animals
 * from PetPoint-powered shelters. Config-driven: each shelter needs an
 * authkey which is embedded in their 24PetConnect partner page.
 *
 * API: https://ws.petango.com/webservices/wsAdoption.asmx
 * Endpoints:
 *   - AdoptableSearch: search animals by species, ageGroup, etc.
 *   - AdoptableDetails: get full details for a specific animal
 *
 * Config: scraper/config/petango-config.json
 */

import type { ScrapedAnimal } from '../types';
import { safeFetchText, isSenior, mapSex, mapSpecies, mapSize, parseAge, SENIOR_AGE } from './base-adapter';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

interface PetangoConfig {
    id: string;
    shelterName: string;
    authkey: string;
    city: string;
    state: string;
    /** Species IDs to search. Default: [1, 2] (Dog, Cat) */
    speciesIds?: number[];
}

interface PetangoAnimal {
    id: string;
    name: string;
    species: string;
    breed: string;
    sex: string;
    age: string;
    size: string;
    photoUrl: string | null;
    photoUrls: string[];
    location: string;
    onHold: boolean;
    specialNeeds: boolean;
    memo: string;
}

// ── Config Loading ─────────────────────────────────────

const CONFIG_PATH = join(__dirname, '../config/petango-config.json');

function loadConfig(): PetangoConfig[] {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as PetangoConfig[];
}

// ── XML Parsing ────────────────────────────────────────
// Petango returns XML. We parse it without a dependency using regex
// (the response structure is simple and predictable).

function extractTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
}

function extractAllTags(xml: string, tag: string): string[] {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const results: string[] = [];
    let m;
    while ((m = regex.exec(xml)) !== null) {
        results.push(m[1].trim());
    }
    return results;
}

function parseAnimalFromXml(animalXml: string): PetangoAnimal | null {
    const id = extractTag(animalXml, 'AnimalID') || extractTag(animalXml, 'ID');
    if (!id) return null;

    const name = extractTag(animalXml, 'AnimalName') || extractTag(animalXml, 'Name') || '';
    const species = extractTag(animalXml, 'Species') || '';
    const primaryBreed = extractTag(animalXml, 'PrimaryBreed') || extractTag(animalXml, 'Breed') || '';
    const secondaryBreed = extractTag(animalXml, 'SecondaryBreed') || '';
    const breed = secondaryBreed ? `${primaryBreed} / ${secondaryBreed}` : primaryBreed;
    const sex = extractTag(animalXml, 'Sex') || '';
    const age = extractTag(animalXml, 'Age') || extractTag(animalXml, 'AgeGroup') || '';
    const size = extractTag(animalXml, 'Size') || extractTag(animalXml, 'AnimalSize') || '';
    const location = extractTag(animalXml, 'Location') || '';
    const onHold = extractTag(animalXml, 'OnHold')?.toLowerCase() === 'yes';
    const specialNeeds = extractTag(animalXml, 'SpecialNeeds')?.toLowerCase() === 'yes';
    const memo = extractTag(animalXml, 'Memo') || extractTag(animalXml, 'BehaviorResult') || '';

    // Photo URL — Petango uses different field names
    const rawPhotoCandidates = [
        extractTag(animalXml, 'Photo'),
        extractTag(animalXml, 'PhotoUrl'),
        extractTag(animalXml, 'MainPhoto'),
        extractTag(animalXml, 'Photo1'),
        extractTag(animalXml, 'serverPhotoUrl'),
    ];
    // Additional photo tags
    const extraPhotoTags = ['Photo2', 'Photo3', 'Photo4', 'Photo5'];
    for (const tag of extraPhotoTags) {
        const val = extractTag(animalXml, tag);
        if (val) rawPhotoCandidates.push(val);
    }

    function normalizePetangoPhoto(url: string | null): string | null {
        if (!url) return null;
        let normalized = url;
        if (!normalized.startsWith('http')) {
            normalized = normalized.startsWith('/')
                ? `https://g.petango.com${normalized}`
                : `https://g.petango.com/${normalized}`;
        }
        if (normalized.includes('noimage') || normalized.includes('nophoto') || normalized.includes('placeholder')) {
            return null;
        }
        return normalized;
    }

    // Deduplicate and normalize all photo URLs
    const allPhotos: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawPhotoCandidates) {
        const url = normalizePetangoPhoto(raw || null);
        if (url && !seen.has(url)) {
            seen.add(url);
            allPhotos.push(url);
        }
    }

    const photoUrl = allPhotos[0] || null;
    const photoUrls = allPhotos.slice(1);

    return { id, name, species, breed, sex, age, size, photoUrl, photoUrls, location, onHold, specialNeeds, memo };
}

// ── API Calls ──────────────────────────────────────────

const API_BASE = 'https://ws.petango.com/webservices/wsAdoption.asmx';

/**
 * Search for adoptable animals via the Petango HTTP GET interface.
 * Note: ageGroup filter is unreliable — many shelters don't use 'Senior'.
 * We fetch all animals and filter by age client-side.
 */
async function searchAdoptable(
    authkey: string,
    speciesID: string = '',
): Promise<PetangoAnimal[]> {
    const params = new URLSearchParams({
        authkey,
        speciesID,
        sex: '',
        ageGroup: '',  // Don't filter — many shelters use 'Adult' not 'Senior'
        location: '',
        site: '',
        onHold: 'A',  // A = All (not on hold)
        orderBy: 'Name',
        primaryBreed: '',
        secondaryBreed: '',
        specialNeeds: '',
        noDogs: '',
        noCats: '',
        noKids: '',
        stageID: '',
    });

    const url = `${API_BASE}/AdoptableSearch?${params.toString()}`;
    const xml = await safeFetchText(url, {
        timeoutMs: 20_000,
        retries: 3,
        expectContentType: 'text/xml',
    });

    // Parse XML response — animals are in repeating XML nodes
    // The exact tag name varies; try common patterns
    const animalBlocks = extractAllTags(xml, 'adoptableSearch') ||
        extractAllTags(xml, 'XmlNode') ||
        extractAllTags(xml, 'adoptableSearchResult');

    if (animalBlocks.length === 0) {
        // Try parsing the entire response as one list of animals
        const directBlocks = extractAllTags(xml, 'AnimalID');
        if (directBlocks.length > 0) {
            // Split the XML by AnimalID tags to get individual animal blocks
            const parts = xml.split(/<AnimalID>/i).slice(1);
            return parts
                .map(part => parseAnimalFromXml(`<AnimalID>${part}`))
                .filter((a): a is PetangoAnimal => a !== null);
        }
    }

    return animalBlocks
        .map(block => parseAnimalFromXml(block))
        .filter((a): a is PetangoAnimal => a !== null);
}

// ── Main Scraper ───────────────────────────────────────

export interface PetangoScrapeResult {
    animals: ScrapedAnimal[];
    shelters: Map<string, { name: string; city: string; state: string }>;
}

/**
 * Scrape adoptable seniors from all configured Petango/PetPoint shelters.
 */
export async function scrapePetango(opts?: {
    shelterIds?: string[];
}): Promise<PetangoScrapeResult> {
    const configs = loadConfig();
    const filtered = opts?.shelterIds
        ? configs.filter(c => opts.shelterIds!.includes(c.id))
        : configs;

    if (filtered.length === 0) {
        console.warn('   ⚠ No Petango shelters configured. Check petango-config.json');
        return { animals: [], shelters: new Map() };
    }

    const allAnimals: ScrapedAnimal[] = [];
    const shelterMap = new Map<string, { name: string; city: string; state: string }>();

    for (const config of filtered) {
        console.log(`   🏠 ${config.shelterName} (${config.city}, ${config.state})...`);

        shelterMap.set(`petango-${config.id}`, {
            name: config.shelterName,
            city: config.city,
            state: config.state,
        });

        // Search for Dog (1) and Cat (2) seniors
        const speciesIds = config.speciesIds || [1, 2];
        const speciesNameMap: Record<number, 'DOG' | 'CAT'> = { 1: 'DOG', 2: 'CAT' };

        for (const speciesId of speciesIds) {
            try {
                const animals = await searchAdoptable(config.authkey, speciesId.toString());
                // Count total and filter for seniors
                let seniorCount = 0;
                console.log(`      ${speciesNameMap[speciesId] ?? 'OTHER'}: ${animals.length} total found`);

                for (const animal of animals) {
                    // Skip if on hold
                    if (animal.onHold) continue;

                    // Parse age — Petango returns age in MONTHS
                    const ageMonths = parseInt(animal.age, 10);
                    const ageYears = !isNaN(ageMonths) ? Math.floor(ageMonths / 12) : parseAge(animal.age);
                    const species = mapSpecies(animal.species) || speciesNameMap[speciesId] || 'OTHER';

                    // Skip non-seniors
                    if (!isSenior(ageYears, species)) continue;
                    seniorCount++;

                    const scraped: ScrapedAnimal = {
                        intakeId: `PT-${config.id}-${animal.id}`,
                        name: animal.name || null,
                        species,
                        breed: animal.breed || null,
                        sex: mapSex(animal.sex),
                        size: mapSize(animal.size),
                        photoUrl: animal.photoUrl,
                        photoUrls: animal.photoUrls,
                        status: animal.specialNeeds ? 'URGENT' : 'AVAILABLE',
                        ageKnownYears: ageYears,
                        ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
                        euthScheduledAt: null,
                        intakeDate: null,
                        notes: animal.memo || null,
                        intakeReason: 'UNKNOWN',
                        intakeReasonDetail: animal.location || null,
                        _shelterId: `petango-${config.id}`,
                        _shelterName: config.shelterName,
                        _shelterCity: config.city,
                        _shelterState: config.state,
                    };

                    allAnimals.push(scraped);
                }
                console.log(`      → ${seniorCount} seniors (≥${SENIOR_AGE[speciesNameMap[speciesId]] ?? 7}yr)`);
            } catch (err) {
                console.error(`      ❌ ${speciesNameMap[speciesId] ?? speciesId}: ${(err as Error).message?.substring(0, 100)}`);
            }

            // Rate limit between species queries
            await new Promise(r => setTimeout(r, 500));
        }

        // Rate limit between shelters
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`   Total Petango seniors: ${allAnimals.length} from ${shelterMap.size} shelters`);
    return { animals: allAnimals, shelters: shelterMap };
}
