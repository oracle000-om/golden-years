/**
 * ShelterLuv — Platform Adapter
 *
 * Fetches adoptable senior animals from shelters using the ShelterLuv
 * platform via their public embed API (v3).
 *
 * API: https://new.shelterluv.com/api/v3/available-animals/{orgId}
 *
 * Config: scraper/config/shelterluv-config.json
 * No API key required — uses the same endpoint as their public embed widgets.
 */

import type { ScrapedAnimal } from '../types';
import { safeFetchJSON, isSenior, mapSex, mapSpecies, mapSize, parseAge } from './base-adapter';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

export interface ShelterLuvConfig {
    id: string;
    shelterName: string;
    orgId: string;
    city: string;
    state: string;
    /** Optional saved_query parameter for filtered views */
    savedQuery?: string;
}

interface ShelterLuvPhoto {
    url?: string;
    isCover?: boolean;
}

interface ShelterLuvAgeGroup {
    id?: number;           // DB record ID — NOT age data
    name?: string;         // "Adult", "Senior", "Young", "Puppy", "Kitten"
    age_from?: number;     // e.g. 1 (years)
    age_to?: number;       // e.g. 7 (years)
    from_unit?: string;    // "years" or "months"
    to_unit?: string;
    name_with_duration?: string; // "Adult (1-7 years)"
    type?: string;         // "Dog" or "Cat"
}

interface ShelterLuvAnimal {
    nid?: string;
    uniqueId?: string;
    name?: string;
    sex?: string;
    species?: string;
    breed?: string;
    age_group?: ShelterLuvAgeGroup | string;
    age?: string;
    birthday?: string | number; // Unix timestamp of animal's birthdate
    intake_date?: string | number; // Unix timestamp
    photos?: ShelterLuvPhoto[] | Record<string, ShelterLuvPhoto>;
    attributes?: string[];
    size?: string;
    weight_group?: string;  // e.g. "Large (60-99)"
    color?: string;
    primary_color?: string;
    description?: string;
    status?: string;
}

// ── Config Loading ─────────────────────────────────────

const CONFIG_PATH = join(__dirname, '../config/shelterluv-config.json');

function loadConfig(): ShelterLuvConfig[] {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as ShelterLuvConfig[];
}

// ── Photo Extraction ───────────────────────────────────

function extractPhotos(photos: ShelterLuvAnimal['photos']): { primary: string | null; extra: string[] } {
    if (!photos) return { primary: null, extra: [] };

    const photoList: ShelterLuvPhoto[] = Array.isArray(photos)
        ? photos
        : Object.values(photos);

    if (photoList.length === 0) return { primary: null, extra: [] };

    // Find cover photo first, fallback to first photo
    const cover = photoList.find(p => p.isCover && p.url);
    const primary = cover?.url || photoList[0]?.url || null;
    const extra = photoList
        .filter(p => p.url && p.url !== primary)
        .map(p => p.url!)
        .slice(0, 4); // Cap at 4 extra photos

    return { primary, extra };
}

// ── Age Parsing ────────────────────────────────────────

function parseAgeFromShelterLuv(animal: ShelterLuvAnimal): number | null {
    // 1. Best source: birthday timestamp → calculate exact age
    if (animal.birthday) {
        const birthdayTs = typeof animal.birthday === 'string'
            ? parseInt(animal.birthday, 10)
            : animal.birthday;
        if (birthdayTs > 0) {
            const ageMs = Date.now() - birthdayTs * 1000;
            const ageYears = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
            if (ageYears >= 0 && ageYears <= 30) return ageYears;
        }
    }

    // 2. Try explicit age string (e.g., "10 years")
    if (animal.age) {
        const ageStr = typeof animal.age === 'string' ? animal.age : String(animal.age);
        const years = parseAge(ageStr);
        if (years !== null) return years;
    }

    // 3. Use age_group object
    if (animal.age_group && typeof animal.age_group === 'object') {
        const ag = animal.age_group;

        // If labeled "Senior", use minimum senior age
        if (ag.name?.toLowerCase() === 'senior') {
            const species = mapSpecies(animal.species);
            return species === 'CAT' ? 10 : 7;
        }

        // Use age_from as a conservative lower bound
        if (ag.age_from != null && ag.from_unit === 'years') {
            return ag.age_from;
        }
    }

    // 4. age_group as plain string
    if (typeof animal.age_group === 'string') {
        if (animal.age_group.toLowerCase().includes('senior')) {
            const species = mapSpecies(animal.species);
            return species === 'CAT' ? 10 : 7;
        }
    }

    return null;
}

// ── API Fetcher ────────────────────────────────────────

const API_BASE = 'https://new.shelterluv.com/api/v3/available-animals';

async function fetchShelterLuvAnimals(config: ShelterLuvConfig): Promise<ScrapedAnimal[]> {
    let url = `${API_BASE}/${config.orgId}`;
    if (config.savedQuery) {
        url += `?saved_query=${config.savedQuery}&embedded=1`;
    }

    console.log(`   🏠 ${config.shelterName} (${config.city}, ${config.state})...`);

    let data: { animals?: ShelterLuvAnimal[] } | ShelterLuvAnimal[];
    try {
        data = await safeFetchJSON(url, {
            retries: 3,
            timeoutMs: 30_000,
            headers: {
                'Accept': 'application/json',
            },
        });
    } catch (err) {
        console.error(`   ❌ ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        return [];
    }

    // Normalize response — may be direct array or { animals: [] }
    const rawAnimals: ShelterLuvAnimal[] = Array.isArray(data)
        ? data
        : (data as any)?.animals || (data as any)?.data || [];

    console.log(`      Raw animals: ${rawAnimals.length}`);

    const animals: ScrapedAnimal[] = [];

    for (const raw of rawAnimals) {
        const species = mapSpecies(raw.species);
        const ageYears = parseAgeFromShelterLuv(raw);
        if (!isSenior(ageYears, species)) continue;

        const id = raw.uniqueId || raw.nid || '';
        if (!id) continue;

        const { primary: photoUrl, extra: photoUrls } = extractPhotos(raw.photos);
        if (!photoUrl) continue; // Photo required

        const breed = raw.breed || null;
        const sex = mapSex(raw.sex);
        const size = mapSize(raw.size);
        const name = raw.name?.trim() || null;
        const notes = raw.description || null;

        const intakeDate = raw.intake_date
            ? new Date(Number(raw.intake_date) * 1000)
            : null;

        // Extract coat colors
        const coatColors: string[] = [];
        if (raw.primary_color) coatColors.push(raw.primary_color);
        if (raw.color && raw.color !== raw.primary_color) coatColors.push(raw.color);

        // Check for special needs in attributes
        const attrs = raw.attributes?.map(a => a.toLowerCase()) || [];
        const specialNeeds = attrs.some(a => a.includes('special needs')) || null;
        const houseTrained = attrs.some(a => a.includes('house trained') || a.includes('housetrained')) || null;
        const goodWithCats = attrs.some(a => a.includes('good with cats') || a.includes('cat friendly')) || null;
        const goodWithDogs = attrs.some(a => a.includes('good with dogs') || a.includes('dog friendly')) || null;
        const goodWithChildren = attrs.some(a => a.includes('good with children') || a.includes('good with kids') || a.includes('kid friendly')) || null;

        // v7: Medical status from attributes
        const isAltered = attrs.some(a => a.includes('spayed') || a.includes('neutered') || a.includes('altered') || a.includes('fixed')) || null;
        const isMicrochipped = attrs.some(a => a.includes('microchip')) || null;
        const isVaccinated = attrs.some(a => a.includes('vaccinated') || a.includes('vaccination') || a.includes('shots current')) || null;

        // v7: Weight from weight_group
        const weight = raw.weight_group || null;

        // v7: Birthday from unix timestamp
        let birthday: Date | null = null;
        if (raw.birthday) {
            const ts = Number(raw.birthday);
            if (!isNaN(ts) && ts > 0) {
                birthday = new Date(ts * 1000);
            }
        }

        // v7: Mixed breed
        const isMixed = breed ? (breed.toLowerCase().includes('mix') || breed.includes('/')) : null;

        // v7: Foster detection from status
        const statusLower = (raw.status || '').toLowerCase();
        const isFosterHome = statusLower.includes('foster') || null;

        animals.push({
            intakeId: `SLV-${config.id}-${id}`,
            name,
            species,
            breed,
            sex,
            size,
            photoUrl,
            photoUrls,
            status: 'AVAILABLE',
            ageKnownYears: ageYears,
            ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
            euthScheduledAt: null,
            intakeDate,
            notes,
            intakeReason: 'UNKNOWN',
            intakeReasonDetail: null,
            // v6: Structured fields
            description: notes, // ShelterLuv description IS the notes
            coatColors,
            specialNeeds: specialNeeds || null,
            houseTrained: houseTrained || null,
            goodWithCats: goodWithCats || null,
            goodWithDogs: goodWithDogs || null,
            goodWithChildren: goodWithChildren || null,
            // v7: Medical status
            isAltered: isAltered || null,
            isMicrochipped: isMicrochipped || null,
            isVaccinated: isVaccinated || null,
            // v7: Physical details
            weight,
            birthday,
            isMixed: isMixed || null,
            // v7: Foster
            isFosterHome: isFosterHome || null,
            // Internal
            _shelterId: `shelterluv-${config.id}`,
            _shelterName: config.shelterName,
            _shelterCity: config.city,
            _shelterState: config.state,
        });
    }

    console.log(`      Seniors with photos: ${animals.length}`);
    return animals;
}

// ── Public API ─────────────────────────────────────────

export interface ShelterLuvScrapeResult {
    animals: ScrapedAnimal[];
    shelters: Map<string, { name: string; city: string; state: string; orgId: string }>;
}

export async function scrapeShelterLuv(opts?: {
    shelterIds?: string[];
    /** 0-indexed shard number for parallel execution */
    shard?: number;
    /** Total number of shards */
    totalShards?: number;
}): Promise<ShelterLuvScrapeResult> {
    const configs = loadConfig();
    let filtered = opts?.shelterIds
        ? configs.filter(c => opts.shelterIds!.includes(c.id))
        : configs;

    // Shard support: split org list into N chunks for parallel execution
    if (opts?.shard != null && opts?.totalShards && opts.totalShards > 1) {
        const chunkSize = Math.ceil(filtered.length / opts.totalShards);
        const start = opts.shard * chunkSize;
        filtered = filtered.slice(start, start + chunkSize);
        console.log(`   📦 Shard ${opts.shard + 1}/${opts.totalShards}: orgs ${start + 1}–${start + filtered.length} of ${configs.length}`);
    }

    if (filtered.length === 0) {
        console.warn('   ⚠ No ShelterLuv shelters configured. Check shelterluv-config.json');
        return { animals: [], shelters: new Map() };
    }

    const allAnimals: ScrapedAnimal[] = [];
    const shelterMap = new Map<string, { name: string; city: string; state: string; orgId: string }>();

    for (const config of filtered) {
        shelterMap.set(`shelterluv-${config.id}`, {
            name: config.shelterName,
            city: config.city,
            state: config.state,
            orgId: config.orgId,
        });

        try {
            const animals = await fetchShelterLuvAnimals(config);
            allAnimals.push(...animals);
        } catch (err) {
            console.error(`   ❌ ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        }

        // Rate limit between shelters
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`   Total ShelterLuv seniors: ${allAnimals.length} from ${shelterMap.size} shelters`);
    return { animals: allAnimals, shelters: shelterMap };
}

export { loadConfig as loadShelterLuvConfig };
