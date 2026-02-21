/**
 * Data access layer — centralized Prisma queries.
 * All database reads go through here so pages stay thin.
 */
import { prisma } from './db';
import type { AnimalWithShelter, AnimalWithShelterAndSources, ShelterWithAnimals } from './types';

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
        const q = filters.q.trim();
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { breed: { contains: q, mode: 'insensitive' } },
            { shelter: { name: { contains: q, mode: 'insensitive' } } },
            { shelter: { county: { contains: q, mode: 'insensitive' } } },
            { shelter: { state: { contains: q, mode: 'insensitive' } } },
        ];
    }

    const animals = await prisma.animal.findMany({
        where,
        include: { shelter: true },
        orderBy: [
            { euthScheduledAt: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'desc' },
        ],
    }) as AnimalWithShelter[];

    // Stable sort: deprioritized animals go to the bottom,
    // but retain their relative urgency order within each group.
    return animals.sort((a, b) => {
        const aDepri = isDeprioritized(a) ? 1 : 0;
        const bDepri = isDeprioritized(b) ? 1 : 0;
        return aDepri - bDepri;
    });
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
                orderBy: { euthScheduledAt: { sort: 'asc', nulls: 'last' } },
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

/** Fetch all distinct states that have shelters (normalized to uppercase, deduplicated). */
export async function getDistinctStates(): Promise<string[]> {
    const shelters = await prisma.shelter.findMany({
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
