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
}

// ─── Animal Queries ──────────────────────────────────────

/** Fetch filtered animal listings with shelter info, ordered by urgency. */
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
        where.shelter = { state: filters.state };
    }

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

    return prisma.animal.findMany({
        where,
        include: { shelter: true },
        orderBy: { euthScheduledAt: 'asc' },
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
                orderBy: { euthScheduledAt: 'asc' },
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

/** Fetch all distinct states that have shelters. */
export async function getDistinctStates(): Promise<string[]> {
    const shelters = await prisma.shelter.findMany({
        select: { state: true },
        distinct: ['state'],
        orderBy: { state: 'asc' },
    });
    return shelters.map((s) => s.state);
}

// ─── Poll Queries ────────────────────────────────────────

/** Fetch all active polls, newest first. */
export async function getActivePolls() {
    return prisma.poll.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
    });
}
