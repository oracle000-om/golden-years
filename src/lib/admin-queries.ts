/**
 * Admin Queries — data access for admin dashboard.
 * Uses aggregate queries against existing schema (no migration needed).
 */
import { prisma } from './db';

// ─── Overview Stats ──────────────────────────────────────

export interface AdminOverview {
    totalAnimals: number;
    activeAnimals: number;
    delistedAnimals: number;
    adoptedAnimals: number;
    totalShelters: number;
    activeShelters: number;
    withCvEstimate: number;
    withPhoto: number;
    speciesBreakdown: { species: string; count: number }[];
    statusBreakdown: { status: string; count: number }[];
    shelterTypeBreakdown: { type: string; shelters: number; animals: number }[];
    recentActivity: RecentAnimal[];
    shelterLeaderboard: ShelterStat[];
    cvConfidenceBreakdown: { confidence: string; count: number }[];
    staleAnimals: number;
}

interface RecentAnimal {
    id: string;
    name: string | null;
    species: string;
    status: string;
    shelterId: string;
    createdAt: Date;
    updatedAt: Date;
}

interface ShelterStat {
    id: string;
    name: string;
    state: string;
    animalCount: number;
    lastScrapedAt: Date | null;
}

export async function getAdminOverview(): Promise<AdminOverview> {
    const [
        totalAnimals,
        activeAnimals,
        delistedAnimals,
        adoptedAnimals,
        totalShelters,
        withCvEstimate,
        withPhoto,
        staleAnimals,
    ] = await Promise.all([
        prisma.animal.count(),
        prisma.animal.count({ where: { status: { in: ['AVAILABLE', 'URGENT'] } } }),
        prisma.animal.count({ where: { status: 'DELISTED' } }),
        prisma.animal.count({ where: { status: 'ADOPTED' } }),
        prisma.shelter.count(),
        prisma.animal.count({ where: { ageEstimatedLow: { not: null } } }),
        prisma.animal.count({ where: { photoUrl: { not: null } } }),
        // Stale = active but not seen in last 48 hours
        prisma.animal.count({
            where: {
                status: { in: ['AVAILABLE', 'URGENT'] },
                lastSeenAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            },
        }),
    ]);

    // Species breakdown
    const speciesGroups = await prisma.animal.groupBy({
        by: ['species'],
        _count: { species: true },
    });
    const speciesBreakdown = speciesGroups
        .map(g => ({ species: g.species, count: g._count.species }))
        .sort((a, b) => b.count - a.count);

    // Status breakdown
    const statusGroups = await prisma.animal.groupBy({
        by: ['status'],
        _count: { status: true },
    });
    const statusBreakdown = statusGroups
        .map(g => ({ status: g.status, count: g._count.status }))
        .sort((a, b) => b.count - a.count);

    // CV confidence breakdown
    const confGroups = await prisma.animal.groupBy({
        by: ['ageConfidence'],
        _count: { ageConfidence: true },
    });
    const cvConfidenceBreakdown = confGroups
        .map(g => ({ confidence: g.ageConfidence, count: g._count.ageConfidence }))
        .sort((a, b) => b.count - a.count);

    // Shelter type breakdown — shelters and active animals by type
    const shelterTypeGroups = await prisma.shelter.groupBy({
        by: ['shelterType'],
        _count: { shelterType: true },
    });

    // Count active animals per shelter type by joining through shelter
    const shelterTypeAnimalCounts = await Promise.all(
        shelterTypeGroups.map(async (g) => {
            const count = await prisma.animal.count({
                where: {
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    shelter: { is: { shelterType: g.shelterType } },
                },
            });
            return {
                type: g.shelterType,
                shelters: g._count.shelterType,
                animals: count,
            };
        })
    );
    const shelterTypeBreakdown = shelterTypeAnimalCounts.sort((a, b) => b.animals - a.animals);

    // Recent activity (last 20 animals updated)
    const recentActivity = await prisma.animal.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
            id: true,
            name: true,
            species: true,
            status: true,
            shelterId: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    // Shelter leaderboard — shelters with most active animals
    const shelters = await prisma.shelter.findMany({
        select: {
            id: true,
            name: true,
            state: true,
            lastScrapedAt: true,
            _count: {
                select: {
                    animals: {
                        where: { status: { in: ['AVAILABLE', 'URGENT'] } },
                    },
                },
            },
        },
        orderBy: {
            animals: { _count: 'desc' },
        },
        take: 20,
    });

    const shelterLeaderboard: ShelterStat[] = shelters.map(s => ({
        id: s.id,
        name: s.name,
        state: s.state,
        animalCount: s._count.animals,
        lastScrapedAt: s.lastScrapedAt,
    }));

    // Count shelters that have at least one active animal (separate query, not capped by leaderboard)
    const activeShelterIds = await prisma.animal.groupBy({
        by: ['shelterId'],
        where: { status: { in: ['AVAILABLE', 'URGENT'] } },
    });
    const activeShelters = activeShelterIds.length;

    return {
        totalAnimals,
        activeAnimals,
        delistedAnimals,
        adoptedAnimals,
        totalShelters,
        activeShelters,
        withCvEstimate,
        withPhoto,
        speciesBreakdown,
        statusBreakdown,
        shelterTypeBreakdown,
        recentActivity,
        shelterLeaderboard,
        cvConfidenceBreakdown,
        staleAnimals,
    };
}

// ─── Animal Detail Stats ──────────────────────────────────

export interface AdminAnimalStats {
    total: number;
    bySpecies: { species: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byAgeSource: { source: string; count: number }[];
    byPhotoQuality: { quality: string; count: number }[];
    bySourceType: { type: string; count: number }[];
    withoutName: number;
    withoutAge: number;
    urgentCount: number;
    avgDaysInShelter: number | null;
    recentlyDelisted: RecentAnimal[];
}

export async function getAdminAnimalStats(): Promise<AdminAnimalStats> {
    const [total, withoutName, withoutAge, urgentCount] = await Promise.all([
        prisma.animal.count(),
        prisma.animal.count({ where: { name: null } }),
        prisma.animal.count({ where: { ageKnownYears: null, ageEstimatedLow: null } }),
        prisma.animal.count({ where: { status: 'URGENT' } }),
    ]);

    const bySpecies = (await prisma.animal.groupBy({ by: ['species'], _count: { species: true } }))
        .map(g => ({ species: g.species, count: g._count.species }));

    const byStatus = (await prisma.animal.groupBy({ by: ['status'], _count: { status: true } }))
        .map(g => ({ status: g.status, count: g._count.status }));

    const byAgeSource = (await prisma.animal.groupBy({ by: ['ageSource'], _count: { ageSource: true } }))
        .map(g => ({ source: g.ageSource, count: g._count.ageSource }));

    const photoQualityGroups = await prisma.animal.groupBy({
        by: ['photoQuality'],
        _count: { photoQuality: true },
        where: { photoQuality: { not: null } },
    });
    const byPhotoQuality = photoQualityGroups
        .map(g => ({ quality: g.photoQuality || 'unknown', count: g._count.photoQuality }));

    // Average days in shelter for active animals
    const activeDays = await prisma.animal.aggregate({
        where: { status: { in: ['AVAILABLE', 'URGENT'] }, daysInShelter: { not: null } },
        _avg: { daysInShelter: true },
    });

    // Recently delisted
    const recentlyDelisted = await prisma.animal.findMany({
        where: { status: 'DELISTED' },
        orderBy: { delistedAt: 'desc' },
        take: 15,
        select: {
            id: true,
            name: true,
            species: true,
            status: true,
            shelterId: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    // Active animals by shelter source type
    const sourceTypeCounts = await Promise.all(
        ['MUNICIPAL', 'RESCUE', 'FOSTER_BASED'].map(async (type) => {
            const count = await prisma.animal.count({
                where: {
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    shelter: { is: { shelterType: type as any } },
                },
            });
            return { type, count };
        })
    );
    const bySourceType = sourceTypeCounts.filter(s => s.count > 0);

    return {
        total,
        bySpecies,
        byStatus,
        byAgeSource,
        byPhotoQuality,
        bySourceType,
        withoutName,
        withoutAge,
        urgentCount,
        avgDaysInShelter: activeDays._avg.daysInShelter,
        recentlyDelisted,
    };
}

// ─── Shelter Stats ──────────────────────────────────────

export interface AdminShelterDetail {
    id: string;
    name: string;
    state: string;
    county: string;
    shelterType: string;
    totalAnimals: number;
    activeAnimals: number;
    lastScrapedAt: Date | null;
    totalIntakeAnnual: number;
    totalEuthanizedAnnual: number;
    dataYear: number | null;
}

export async function getAdminShelterList(): Promise<AdminShelterDetail[]> {
    const shelters = await prisma.shelter.findMany({
        select: {
            id: true,
            name: true,
            state: true,
            county: true,
            shelterType: true,
            lastScrapedAt: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            dataYear: true,
            _count: {
                select: {
                    animals: true,
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    // Also get active counts
    const activeCounts = await prisma.animal.groupBy({
        by: ['shelterId'],
        where: { status: { in: ['AVAILABLE', 'URGENT'] } },
        _count: { shelterId: true },
    });
    const activeMap = new Map(activeCounts.map(g => [g.shelterId, g._count.shelterId]));

    return shelters.map(s => ({
        id: s.id,
        name: s.name,
        state: s.state,
        county: s.county,
        shelterType: s.shelterType,
        totalAnimals: s._count.animals,
        activeAnimals: activeMap.get(s.id) || 0,
        lastScrapedAt: s.lastScrapedAt,
        totalIntakeAnnual: s.totalIntakeAnnual,
        totalEuthanizedAnnual: s.totalEuthanizedAnnual,
        dataYear: s.dataYear,
    }));
}
