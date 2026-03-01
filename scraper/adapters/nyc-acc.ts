/**
 * NYC Animal Care Centers — Scraper Adapter
 *
 * NYC ACC uses ShelterBuddy/Adopets. Their adoption search loads
 * data from a JSON API endpoint.
 *
 * Listings: https://nycacc.org/adopt
 * Data likely via: https://nycacc.app API or embedded data
 */
import type { ScrapedAnimal } from '../types';
import { safeFetchJSON, safeFetchText, classifyAgeSegment, mapSex, mapSpecies, mapSize, parseAge } from './base-adapter';

const SEARCH_URL = 'https://nycacc.org/adopt';

interface NycAnimal {
    animalID?: string;
    id?: string;
    name?: string;
    species?: string;
    primaryBreed?: string;
    secondaryBreed?: string;
    sex?: string;
    age?: string;
    size?: string;
    photo?: string;
    photoUrl?: string;
    description?: string;
    location?: string;
    intakeType?: string;
    daysInCare?: number;
    atRisk?: boolean;
}

/**
 * Try known NYC ACC API endpoints to find adoptable animals.
 * NYC ACC has changed their API multiple times — we try several patterns.
 */
async function fetchNycAnimals(): Promise<NycAnimal[]> {
    // Try known API patterns
    const endpoints = [
        'https://nycacc.org/api/adopt',
        'https://nycacc.org/services/adoptable',
        'https://www.nycacc.org/adopt/dogs',
    ];

    for (const url of endpoints) {
        try {
            const data = await safeFetchJSON<NycAnimal[] | { animals?: NycAnimal[]; data?: NycAnimal[] }>(url, {
                retries: 2,
                timeoutMs: 20_000,
            });
            if (Array.isArray(data)) return data;
            if (data && typeof data === 'object') {
                if (Array.isArray((data as any).animals)) return (data as any).animals;
                if (Array.isArray((data as any).data)) return (data as any).data;
            }
        } catch {
            // Try next endpoint
        }
    }

    // Fallback: scrape the HTML page for embedded JSON data
    try {
        const html = await safeFetchText(SEARCH_URL, { retries: 2 });
        // Look for embedded JSON (common pattern: __NEXT_DATA__ or window.__data__)
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
        if (nextDataMatch) {
            const nextData = JSON.parse(nextDataMatch[1]);
            const animals = nextData?.props?.pageProps?.animals || nextData?.props?.pageProps?.data || [];
            if (Array.isArray(animals) && animals.length > 0) return animals;
        }

        const windowDataMatch = html.match(/window\.__data__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
        if (windowDataMatch) {
            const data = JSON.parse(windowDataMatch[1]);
            const animals = data?.animals || data?.data || [];
            if (Array.isArray(animals)) return animals;
        }
    } catch {
        // Non-fatal
    }

    return [];
}

export async function scrapeNycAcc(): Promise<ScrapedAnimal[]> {
    console.log('   Fetching NYC ACC animals...');
    const raw = await fetchNycAnimals();
    console.log(`   Raw animals fetched: ${raw.length}`);

    const animals: ScrapedAnimal[] = [];
    for (const r of raw) {
        const species = mapSpecies(r.species);
        const ageYears = parseAge(r.age);

        const id = r.animalID || r.id || '';
        const photoUrl = r.photo || r.photoUrl || null;
        if (!photoUrl) continue;

        const breed = [r.primaryBreed, r.secondaryBreed].filter(Boolean).join(' / ') || null;

        animals.push({
            intakeId: id,
            name: r.name?.trim() || null,
            species,
            breed,
            sex: mapSex(r.sex),
            size: mapSize(r.size),
            photoUrl,
            status: r.atRisk ? 'URGENT' : 'AVAILABLE',
            ageKnownYears: ageYears,
            ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
            euthScheduledAt: null,
            intakeDate: null,
            notes: r.description || null,
            intakeReason: r.intakeType?.toLowerCase().includes('stray') ? 'STRAY'
                : r.intakeType?.toLowerCase().includes('owner') ? 'OWNER_SURRENDER' : 'UNKNOWN',
            intakeReasonDetail: r.location || null,
            ageSegment: classifyAgeSegment(ageYears, species),
        });
    }

    console.log(`   NYC ACC animals with photos: ${animals.length}`);
    return animals;
}
