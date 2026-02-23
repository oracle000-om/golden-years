/**
 * Generic Web Scraper Adapter — Config-Driven
 *
 * For shelters with custom web pages that don't have a structured API,
 * this adapter scrapes their adoption search pages looking for embedded
 * JSON data or structured HTML patterns.
 *
 * Each shelter has a config entry with the URL patterns to try.
 * This covers: San Antonio, Dallas, Memphis, Jacksonville,
 * Fulton County, San Diego, Las Vegas, Philadelphia, Harris County.
 */
import type { ScrapedAnimal } from '../types';
import { safeFetchJSON, safeFetchText, isSenior, mapSex, mapSpecies, mapSize, parseAge } from './base-adapter';

// ── Shelter Configs ────────────────────────────────────

export interface WebShelterConfig {
    id: string;
    shelterName: string;
    city: string;
    state: string;
    /** URLs to try for JSON API (in order) */
    apiUrls: string[];
    /** Fallback: URL of the HTML adoption page to scrape */
    htmlUrl: string;
    /** CSS-like hints for parsing HTML (optional) */
    parseHints?: {
        animalIdField?: string;
        speciesField?: string;
        nameField?: string;
    };
}

export const WEB_SHELTER_CONFIGS: WebShelterConfig[] = [
    {
        id: 'san-antonio',
        shelterName: 'San Antonio Animal Care Services',
        city: 'San Antonio',
        state: 'TX',
        apiUrls: [
            'https://www.sanantonio.gov/Animal-Care/ACS-Pet-Search',
        ],
        htmlUrl: 'https://www.sanantonio.gov/Animal-Care/ACS-Pet-Search',
    },
    {
        id: 'dallas',
        shelterName: 'Dallas Animal Services',
        city: 'Dallas',
        state: 'TX',
        apiUrls: [
            'https://www.dallasopendata.com/resource/uyte-zi7f.json?$where=outcome_type IS NULL&$limit=2000',
        ],
        htmlUrl: 'https://dallasanimalservices.org/adopt',
    },
    {
        id: 'memphis',
        shelterName: 'Memphis Animal Services',
        city: 'Memphis',
        state: 'TN',
        apiUrls: [],
        htmlUrl: 'https://memphisanimalservices.com/adopt/',
    },
    {
        id: 'jacksonville',
        shelterName: 'Jacksonville ACPS',
        city: 'Jacksonville',
        state: 'FL',
        apiUrls: [],
        htmlUrl: 'https://www.coj.net/departments/neighborhoods/animal-care-and-protective-services/adopt-a-pet',
    },
    {
        id: 'fulton-county',
        shelterName: 'Fulton County Animal Services',
        city: 'Atlanta',
        state: 'GA',
        apiUrls: [],
        htmlUrl: 'https://www.fultonanimalservices.com/adoptable-pets',
    },
    {
        id: 'san-diego',
        shelterName: 'San Diego Humane Society',
        city: 'San Diego',
        state: 'CA',
        apiUrls: [
            'https://www.sdhumane.org/wp-json/wp/v2/adoptable-pets',
        ],
        htmlUrl: 'https://www.sdhumane.org/adopt/',
    },
    {
        id: 'las-vegas',
        shelterName: 'The Animal Foundation',
        city: 'Las Vegas',
        state: 'NV',
        apiUrls: [
            'https://animalfoundation.com/api/adoptable-pets',
        ],
        htmlUrl: 'https://animalfoundation.com/adopt-a-pet/adoption-search',
    },
    {
        id: 'philadelphia',
        shelterName: 'ACCT Philadelphia',
        city: 'Philadelphia',
        state: 'PA',
        apiUrls: [],
        htmlUrl: 'https://www.acctphilly.org/adopt/',
    },
    {
        id: 'harris-county',
        shelterName: 'Harris County Animal Shelter',
        city: 'Houston',
        state: 'TX',
        apiUrls: [],
        htmlUrl: 'https://countypets.com/harris-county/',
    },
    {
        id: 'miami-dade',
        shelterName: 'Miami-Dade Animal Services',
        city: 'Miami',
        state: 'FL',
        apiUrls: [],
        htmlUrl: 'https://www.miamidade.gov/global/animals/home.page',
    },
    {
        id: 'san-jose',
        shelterName: 'San Jose Animal Care Center',
        city: 'San Jose',
        state: 'CA',
        apiUrls: [],
        htmlUrl: 'https://www.sanjoseca.gov/your-government/departments-offices/animal-care-services/adopt-a-pet',
    },
    {
        id: 'indianapolis',
        shelterName: 'Indianapolis Animal Care Services',
        city: 'Indianapolis',
        state: 'IN',
        apiUrls: [],
        htmlUrl: 'https://www.indy.gov/agency/animal-care-services',
    },
    {
        id: 'pima',
        shelterName: 'Pima Animal Care Center',
        city: 'Tucson',
        state: 'AZ',
        apiUrls: [],
        htmlUrl: 'https://www.pima.gov/government/departments/animal-care-center',
    },
];

// ── Generic JSON/HTML Scraper ──────────────────────────

interface RawAnimal {
    [key: string]: any;
}

/**
 * Extract animal data from an arbitrary JSON response.
 * Handles common patterns: direct array, { animals: [] }, { data: [] }, { results: [] }
 */
function extractAnimalsFromJson(data: any): RawAnimal[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        for (const key of ['animals', 'data', 'results', 'pets', 'items', 'records']) {
            if (Array.isArray(data[key])) return data[key];
        }
    }
    return [];
}

/**
 * Try to extract embedded JSON from an HTML page (supports Next.js,
 * window.__data__, and other common embedding patterns).
 */
function extractEmbeddedJson(html: string): RawAnimal[] {
    const patterns = [
        /<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/,
        /window\.__data__\s*=\s*({[\s\S]*?});?\s*<\/script>/,
        /window\.initialData\s*=\s*({[\s\S]*?});?\s*<\/script>/,
        /data-animals='(\[[\s\S]*?\])'/,
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            try {
                const parsed = JSON.parse(match[1]);
                return extractAnimalsFromJson(parsed?.props?.pageProps || parsed);
            } catch { /* Non-fatal */ }
        }
    }

    return [];
}

/**
 * Normalize a raw animal object (arbitrary field names) into a ScrapedAnimal.
 * Uses flexible field name matching to handle different shelter systems.
 */
function normalizeAnimal(raw: RawAnimal, _config: WebShelterConfig): ScrapedAnimal | null {
    // Find ID
    const id = raw.animalID || raw.animalId || raw.animal_id || raw.id || raw.ID || '';
    if (!id) return null;

    // Find species
    const speciesRaw = raw.species || raw.animal_type || raw.animalType || raw.type || '';
    const species = mapSpecies(speciesRaw);

    // Find age
    const ageRaw = raw.age || raw.age_upon_outcome || raw.ageGroup || raw.years_old || raw.Age || '';
    const ageYears = typeof ageRaw === 'number' ? ageRaw : parseAge(String(ageRaw));
    if (!isSenior(ageYears, species)) return null;

    // Find photo
    const photoUrl = raw.photoUrl || raw.photo || raw.imageUrl || raw.image || raw.Photo1 ||
        raw.primary_photo || raw.photo_url || null;
    if (!photoUrl) return null;

    // Find other fields
    const name = raw.name || raw.animalName || raw.animal_name || raw.Name || null;
    const breed = raw.breed || raw.primaryBreed || raw.animal_breed || raw.Breed || null;
    const sex = raw.sex || raw.gender || raw.sex_upon_outcome || raw.Sex || '';
    const size = raw.size || raw.animalSize || raw.Size || '';
    const notes = raw.description || raw.notes || raw.memo || raw.bio || null;
    const intakeType = raw.intakeType || raw.intake_type || raw.reason || '';

    return {
        intakeId: String(id),
        name: name?.trim() || null,
        species,
        breed: breed || null,
        sex: mapSex(sex),
        size: mapSize(size),
        photoUrl,
        status: 'AVAILABLE',
        ageKnownYears: ageYears,
        ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
        euthScheduledAt: null,
        intakeDate: null,
        notes: notes || null,
        intakeReason: intakeType?.toLowerCase().includes('stray') ? 'STRAY'
            : intakeType?.toLowerCase().includes('owner') ? 'OWNER_SURRENDER' : 'UNKNOWN',
        intakeReasonDetail: null,
    };
}

// ── Public API ─────────────────────────────────────────

/**
 * Scrape a single shelter using its config.
 * Tries API endpoints first, falls back to HTML scraping.
 */
export async function scrapeWebShelter(config: WebShelterConfig): Promise<ScrapedAnimal[]> {
    console.log(`   🏠 ${config.shelterName} (${config.city}, ${config.state})...`);

    let rawAnimals: RawAnimal[] = [];

    // Try API endpoints
    for (const url of config.apiUrls) {
        try {
            const data = await safeFetchJSON<any>(url, { retries: 2, timeoutMs: 20_000 });
            rawAnimals = extractAnimalsFromJson(data);
            if (rawAnimals.length > 0) {
                console.log(`      API hit: ${rawAnimals.length} animals from ${url}`);
                break;
            }
        } catch { /* Try next */ }
    }

    // If API failed, try HTML scraping
    if (rawAnimals.length === 0) {
        try {
            const html = await safeFetchText(config.htmlUrl, { retries: 2, timeoutMs: 20_000 });
            rawAnimals = extractEmbeddedJson(html);
            if (rawAnimals.length > 0) {
                console.log(`      HTML scrape: ${rawAnimals.length} animals from embedded JSON`);
            } else {
                console.log(`      ⚠ No structured data found at ${config.htmlUrl}`);
            }
        } catch (err) {
            console.log(`      ⚠ HTML scrape failed: ${(err as Error).message?.substring(0, 80)}`);
        }
    }

    // Normalize and filter
    const animals: ScrapedAnimal[] = [];
    for (const raw of rawAnimals) {
        const animal = normalizeAnimal(raw, config);
        if (animal) animals.push(animal);
    }

    console.log(`      Seniors with photos: ${animals.length}`);
    return animals;
}

/**
 * Scrape all web-based shelters.
 */
export async function scrapeAllWebShelters(opts?: {
    shelterIds?: string[];
}): Promise<{ animals: ScrapedAnimal[]; configs: WebShelterConfig[] }> {
    const configs = opts?.shelterIds
        ? WEB_SHELTER_CONFIGS.filter(c => opts.shelterIds!.includes(c.id))
        : WEB_SHELTER_CONFIGS;

    const allAnimals: ScrapedAnimal[] = [];
    for (const config of configs) {
        try {
            const animals = await scrapeWebShelter(config);
            // Add shelter metadata
            for (const a of animals) {
                a._shelterId = config.id;
                a._shelterName = config.shelterName;
                a._shelterCity = config.city;
                a._shelterState = config.state;
            }
            allAnimals.push(...animals);
        } catch (err) {
            console.error(`   ❌ ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        }

        // Rate limit between shelters
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`   Total web shelter seniors: ${allAnimals.length} from ${configs.length} shelters`);
    return { animals: allAnimals, configs };
}
