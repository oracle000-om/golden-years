/**
 * Maricopa County Animal Care & Control — Scraper Adapter
 *
 * Maricopa uses a custom app at apps.pets.maricopa.gov.
 * The underlying API serves JSON data for their adoption search.
 *
 * API: https://apps.pets.maricopa.gov (internal API endpoints)
 * Site: https://pets.maricopa.gov/adopt
 */
import type { ScrapedAnimal } from '../types';
import { safeFetchJSON, safeFetchText, classifyAgeSegment, mapSex, mapSize, parseAge } from './base-adapter';

const SEARCH_BASE = 'https://apps.pets.maricopa.gov';

interface MaricopaAnimal {
    animalId?: string;
    animalID?: string;
    name?: string;
    species?: string;
    type?: string;
    breed?: string;
    primaryBreed?: string;
    secondaryBreed?: string;
    sex?: string;
    gender?: string;
    age?: string;
    ageYears?: number;
    size?: string;
    photoUrl?: string;
    photo?: string;
    imageUrl?: string;
    location?: string;
    kennel?: string;
    description?: string;
    intakeType?: string;
    priorityPlacement?: boolean;
}

async function fetchMaricopaAnimals(): Promise<MaricopaAnimal[]> {
    // Try known API patterns for Maricopa's custom app
    const endpoints = [
        `${SEARCH_BASE}/api/animals?status=available`,
        `${SEARCH_BASE}/api/adoptable`,
        `${SEARCH_BASE}/AdoptPets/api/animals`,
    ];

    for (const url of endpoints) {
        try {
            const data = await safeFetchJSON<any>(url, { retries: 2, timeoutMs: 20_000 });
            const animals = Array.isArray(data) ? data
                : data?.animals ?? data?.data ?? data?.results ?? [];
            if (Array.isArray(animals) && animals.length > 0) return animals;
        } catch { /* Try next */ }
    }

    // Fallback: scrape the priority pets page
    try {
        const html = await safeFetchText('https://pets.maricopa.gov/priority-pets', { retries: 2 });
        const dataMatch = html.match(/__NEXT_DATA__[^>]*>({[\s\S]*?})<\/script>/) ||
            html.match(/window\.__data__\s*=\s*({[\s\S]*?});/);
        if (dataMatch) {
            const parsed = JSON.parse(dataMatch[1]);
            return parsed?.props?.pageProps?.animals || parsed?.animals || [];
        }
    } catch { /* Non-fatal */ }

    return [];
}

export async function scrapeMaricopa(): Promise<ScrapedAnimal[]> {
    console.log('   Fetching Maricopa County animals...');
    const raw = await fetchMaricopaAnimals();
    console.log(`   Raw animals fetched: ${raw.length}`);

    const animals: ScrapedAnimal[] = [];
    for (const r of raw) {
        const species = r.species?.toUpperCase() === 'DOG' ? 'DOG' as const
            : r.species?.toUpperCase() === 'CAT' ? 'CAT' as const
                : r.type?.toUpperCase() === 'DOG' ? 'DOG' as const
                    : r.type?.toUpperCase() === 'CAT' ? 'CAT' as const
                        : 'OTHER' as const;

        const ageYears = r.ageYears ?? parseAge(r.age);

        const id = r.animalId || r.animalID || '';
        const photoUrl = r.photoUrl || r.photo || r.imageUrl || null;
        if (!photoUrl) continue;

        const breed = r.breed || [r.primaryBreed, r.secondaryBreed].filter(Boolean).join(' / ') || null;

        animals.push({
            intakeId: id,
            name: r.name?.trim() || null,
            species,
            breed,
            sex: mapSex(r.sex || r.gender),
            size: mapSize(r.size),
            photoUrl,
            status: r.priorityPlacement ? 'URGENT' : 'AVAILABLE',
            ageKnownYears: ageYears,
            ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
            euthScheduledAt: null,
            intakeDate: null,
            notes: r.description || null,
            intakeReason: r.intakeType?.toLowerCase().includes('stray') ? 'STRAY'
                : r.intakeType?.toLowerCase().includes('owner') ? 'OWNER_SURRENDER' : 'UNKNOWN',
            intakeReasonDetail: r.location || r.kennel || null,
            ageSegment: classifyAgeSegment(ageYears, species),
        });
    }

    console.log(`   Maricopa animals with photos: ${animals.length}`);
    return animals;
}
