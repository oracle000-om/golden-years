/**
 * Data access layer — centralized Prisma queries.
 * All database reads go through here so pages stay thin.
 */
import { prisma } from './db';
import type { AnimalWithShelter, AnimalWithShelterAndSources, ShelterWithAnimals } from './types';
import { parseSearchQuery, type SearchIntent } from './search-parser';

// ─── Filters ─────────────────────────────────────────────

export interface AnimalFilters {
    species?: string;
    sex?: string;
    state?: string;
    time?: string;
    q?: string;
    zip?: string;
}

// ─── Animal Queries ──────────────────────────────────────

/**
 * Determine if an animal is "deprioritized" — our CV age estimate
 * says the animal is likely NOT a senior.
 * Dogs: senior = 7+, Cats: senior = 10+
 *
 * If CV ran and ageEstimatedHigh < threshold, deprioritize regardless
 * of what the shelter/API reported. CV is the source of truth since
 * photos don't lie about age indicators.
 *
 * Animals without CV data (ageEstimatedHigh === null) are unaffected.
 */
function isDeprioritized(animal: AnimalWithShelter): boolean {
    const threshold = animal.species === 'CAT' ? 10 : 7;
    if (animal.ageEstimatedHigh !== null && animal.ageEstimatedHigh < threshold) {
        return true;
    }
    return false;
}

/** Fetch filtered animal listings with shelter info, ordered by urgency.
 *  Animals where shelter says senior but GY disagrees are deprioritized to the bottom. */
export async function getFilteredAnimals(filters: AnimalFilters): Promise<AnimalWithShelter[]> {
    const where: Record<string, unknown> = {
        status: { in: ['LISTED', 'URGENT'] },
    };

    if (filters.species && filters.species !== 'all') {
        where.species = filters.species.toUpperCase();
    }

    if (filters.sex && filters.sex !== 'all') {
        where.sex = filters.sex.toUpperCase();
    }

    if (filters.state && filters.state !== 'all') {
        where.shelter = {
            ...(where.shelter as Record<string, unknown> || {}),
            state: { equals: filters.state, mode: 'insensitive' },
        };
    }

    if (filters.zip && filters.zip.trim()) {
        const zip = filters.zip.trim();
        where.shelter = {
            ...(where.shelter as Record<string, unknown> || {}),
            OR: [
                { zipCode: zip },
                { address: { contains: zip } },
            ],
        };
    }

    // Timeframe filter: only apply when euthScheduledAt data exists.
    // Currently most animals lack explicit euthanasia dates, so this
    // filter is only active when real scheduling data is available.
    if (filters.time && filters.time !== 'all') {
        const hoursMap: Record<string, number> = {
            '24': 24, '48': 48, '72': 72, '168': 168,
        };
        const hours = hoursMap[filters.time];
        if (hours) {
            const now = Date.now();
            where.euthScheduledAt = {
                lte: new Date(now + hours * 60 * 60 * 1000),
                gte: new Date(now),
            };
        }
    }

    if (filters.q && filters.q.trim()) {
        const intent = parseSearchQuery(filters.q);
        await applySearchIntent(where, intent);
    }

    const animals = await prisma.animal.findMany({
        where,
        include: { shelter: true },
        orderBy: [
            { createdAt: 'desc' },
        ],
    }) as AnimalWithShelter[];

    // Stable sort:
    // 1. euthScheduledAt ascending (nulls last) — most urgent first
    // 2. Deprioritized animals go to the bottom
    // (createdAt desc is already handled by the DB orderBy above)
    return animals.sort((a, b) => {
        // Urgency: non-null euthScheduledAt first, sorted ascending
        const aEuth = a.euthScheduledAt ? new Date(a.euthScheduledAt).getTime() : Infinity;
        const bEuth = b.euthScheduledAt ? new Date(b.euthScheduledAt).getTime() : Infinity;
        if (aEuth !== bEuth) return aEuth - bEuth;

        // Then deprioritized animals go to the bottom
        const aDepri = isDeprioritized(a) ? 1 : 0;
        const bDepri = isDeprioritized(b) ? 1 : 0;
        return aDepri - bDepri;
    });
}

// ─── NLP Search Intent → Prisma WHERE ────────────────────

/** Apply parsed NLP search intent to a Prisma WHERE clause. */
async function applySearchIntent(
    where: Record<string, unknown>,
    intent: SearchIntent,
): Promise<void> {
    const andClauses: Record<string, unknown>[] = [];

    // Species
    if (intent.species && !where.species) {
        andClauses.push({ species: intent.species });
    }

    // Sex
    if (intent.sex) {
        andClauses.push({ sex: intent.sex });
    }

    // Size
    if (intent.size) {
        andClauses.push({ size: intent.size });
    }

    // Age: minAge (e.g. "over 10")
    if (intent.minAge !== null) {
        andClauses.push({
            OR: [
                { ageKnownYears: { gte: intent.minAge } },
                { ageEstimatedLow: { gte: intent.minAge } },
            ],
        });
    }

    // Age: maxAge (e.g. "under 8")
    if (intent.maxAge !== null) {
        andClauses.push({
            OR: [
                { ageKnownYears: { lte: intent.maxAge } },
                { ageEstimatedHigh: { lte: intent.maxAge } },
            ],
        });
    }

    // Urgency
    if (intent.urgency) {
        andClauses.push({
            OR: [
                { euthScheduledAt: { not: null } },
                { status: 'URGENT' },
            ],
        });
    }

    // State (from NLP, only if not already filtered via dropdown)
    if (intent.state && !where.shelter) {
        andClauses.push({
            shelter: { state: { equals: intent.state, mode: 'insensitive' } },
        });
    }

    // City — match against shelter county, name, or address
    if (intent.city) {
        andClauses.push({
            OR: [
                { shelter: { county: { contains: intent.city, mode: 'insensitive' } } },
                { shelter: { name: { contains: intent.city, mode: 'insensitive' } } },
            ],
        });
    }

    // Color keywords — match against breed field
    if (intent.colors.length > 0) {
        const colorOr = intent.colors.map((c) => ({
            breed: { contains: c, mode: 'insensitive' as const },
        }));
        andClauses.push({ OR: colorOr });
    }

    // Breed matches
    if (intent.breeds.length > 0) {
        const breedOr = intent.breeds.map((b) => ({
            breed: { contains: b, mode: 'insensitive' as const },
        }));
        andClauses.push({ OR: breedOr });
    }

    // Breed group expansion — lookup breed names from BreedProfile table
    if (intent.breedGroups.length > 0) {
        const profiles = await prisma.breedProfile.findMany({
            where: { breedGroup: { in: intent.breedGroups } },
            select: { name: true },
        });
        if (profiles.length > 0) {
            const groupBreedOr = profiles.map((p: { name: string }) => ({
                breed: { contains: p.name, mode: 'insensitive' as const },
            }));
            andClauses.push({ OR: groupBreedOr });
        }
    }

    // Zip code — match against shelter zipCode
    if (intent.zip) {
        andClauses.push({
            shelter: { zipCode: { startsWith: intent.zip } },
        });
    }

    // Remaining text tokens — each must match somewhere (AND logic)
    for (const token of intent.textTokens) {
        andClauses.push({
            OR: [
                { name: { contains: token, mode: 'insensitive' } },
                { breed: { contains: token, mode: 'insensitive' } },
                { shelter: { name: { contains: token, mode: 'insensitive' } } },
                { shelter: { county: { contains: token, mode: 'insensitive' } } },
            ],
        });
    }

    // Merge into WHERE
    if (andClauses.length > 0) {
        where.AND = [...(where.AND as Record<string, unknown>[] || []), ...andClauses];
    }
}

/** Search animals using NLP-parsed intent (used by /api/search). */
export async function searchAnimals(intent: SearchIntent): Promise<AnimalWithShelter[]> {
    const where: Record<string, unknown> = {
        status: { in: ['LISTED', 'URGENT'] },
    };

    await applySearchIntent(where, intent);

    const animals = await prisma.animal.findMany({
        where,
        include: { shelter: true },
        orderBy: [{ createdAt: 'desc' }],
    }) as AnimalWithShelter[];

    return animals.sort((a, b) => {
        const aEuth = a.euthScheduledAt ? new Date(a.euthScheduledAt).getTime() : Infinity;
        const bEuth = b.euthScheduledAt ? new Date(b.euthScheduledAt).getTime() : Infinity;
        if (aEuth !== bEuth) return aEuth - bEuth;

        const aDepri = isDeprioritized(a) ? 1 : 0;
        const bDepri = isDeprioritized(b) ? 1 : 0;
        return aDepri - bDepri;
    });
}

// ─── "Did You Mean?" Suggestions ─────────────────────────

export interface SearchSuggestion {
    label: string;
    q: string;
    count: number;
}

/**
 * Generate alternative search suggestions when a query returns 0 results.
 * Relaxes the most restrictive filter one at a time and returns alternatives.
 */
export async function getSuggestions(intent: SearchIntent): Promise<SearchSuggestion[]> {
    const suggestions: SearchSuggestion[] = [];

    // Fields to try relaxing, in order of "most likely to be too restrictive"
    const relaxations: { label: string; modify: (i: SearchIntent) => SearchIntent }[] = [];

    if (intent.state) {
        relaxations.push({
            label: `without ${intent.state}`,
            modify: (i) => ({ ...i, state: null }),
        });
    }
    if (intent.city) {
        relaxations.push({
            label: `without city filter`,
            modify: (i) => ({ ...i, city: null }),
        });
    }
    if (intent.breeds.length > 0) {
        relaxations.push({
            label: `any breed`,
            modify: (i) => ({ ...i, breeds: [] }),
        });
    }
    if (intent.colors.length > 0) {
        relaxations.push({
            label: `any color`,
            modify: (i) => ({ ...i, colors: [] }),
        });
    }
    if (intent.minAge !== null) {
        relaxations.push({
            label: `any age`,
            modify: (i) => ({ ...i, minAge: null, maxAge: null }),
        });
    }
    if (intent.sex) {
        relaxations.push({
            label: `any gender`,
            modify: (i) => ({ ...i, sex: null }),
        });
    }
    if (intent.size) {
        relaxations.push({
            label: `any size`,
            modify: (i) => ({ ...i, size: null }),
        });
    }
    if (intent.textTokens.length > 0) {
        relaxations.push({
            label: `without text filter`,
            modify: (i) => ({ ...i, textTokens: [] }),
        });
    }

    // Try each relaxation and see how many results it yields
    for (const relax of relaxations) {
        if (suggestions.length >= 3) break; // cap at 3 suggestions

        const relaxedIntent = relax.modify({ ...intent });
        const where: Record<string, unknown> = {
            status: { in: ['LISTED', 'URGENT'] },
        };
        await applySearchIntent(where, relaxedIntent);

        const count = await prisma.animal.count({ where });
        if (count > 0) {
            // Build a human-readable query string from the relaxed intent
            const parts: string[] = [];
            if (relaxedIntent.species) parts.push(relaxedIntent.species.toLowerCase());
            if (relaxedIntent.sex) parts.push(relaxedIntent.sex.toLowerCase());
            if (relaxedIntent.size) parts.push(relaxedIntent.size.toLowerCase());
            for (const b of relaxedIntent.breeds) parts.push(b);
            for (const c of relaxedIntent.colors) parts.push(c);
            if (relaxedIntent.state) parts.push(relaxedIntent.state);
            if (relaxedIntent.city) parts.push(relaxedIntent.city.toLowerCase());
            if (relaxedIntent.urgency) parts.push('urgent');
            if (relaxedIntent.minAge !== null) parts.push(`over ${relaxedIntent.minAge}`);
            for (const t of relaxedIntent.textTokens) parts.push(t);

            suggestions.push({
                label: relax.label,
                q: parts.join(' '),
                count,
            });
        }
    }

    return suggestions;
}

/** Fetch a single animal by ID with shelter and sources. */
export async function getAnimalById(id: string): Promise<AnimalWithShelterAndSources | null> {
    return prisma.animal.findUnique({
        where: { id },
        include: {
            shelter: true,
            sources: true,
        },
    });
}

/** Fetch minimal animal data for metadata generation (no sources needed). */
export async function getAnimalForMetadata(id: string) {
    return prisma.animal.findUnique({
        where: { id },
        include: { shelter: true },
    });
}

// ─── Shelter Queries ─────────────────────────────────────

/** Fetch a shelter by ID with its listed/urgent animals. */
export async function getShelterById(id: string): Promise<ShelterWithAnimals | null> {
    return prisma.shelter.findUnique({
        where: { id },
        include: {
            animals: {
                where: { status: { in: ['LISTED', 'URGENT'] } },
                orderBy: { createdAt: 'desc' },
            },
        },
    });
}

/** Fetch shelter with animals (unordered, for metadata). */
export async function getShelterForMetadata(id: string) {
    return prisma.shelter.findUnique({
        where: { id },
        include: {
            animals: {
                where: { status: { in: ['LISTED', 'URGENT'] } },
            },
        },
    });
}

/** Fetch distinct states that have shelters with active (LISTED/URGENT) animals. */
export async function getDistinctStates(): Promise<string[]> {
    const shelters = await prisma.shelter.findMany({
        where: {
            animals: {
                some: { status: { in: ['LISTED', 'URGENT'] } },
            },
        },
        select: { state: true },
    });
    const unique = [...new Set(shelters.map((s) => s.state.toUpperCase()))]
        .filter((s) => /^[A-Z]{2}$/.test(s))
        .sort();
    return unique;
}

// ─── Poll Queries ────────────────────────────────────────

/** Fetch all active polls, newest first. */
export async function getActivePolls() {
    return prisma.poll.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
    });
}
