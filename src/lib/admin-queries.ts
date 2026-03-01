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
    // Enhancement 1: Data quality
    withoutPhoto: number;
    withoutSize: number;
    withoutSex: number;
    withConflicts: number;
    withVisibleConditions: number;
    // Enhancement 5: State coverage
    stateBreakdown: { state: string; shelters: number; animals: number }[];
    totalStates: number;
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
        withoutPhoto,
        withoutSize,
        withoutSex,
        withConflicts,
        withVisibleConditions,
    ] = await Promise.all([
        prisma.animal.count(),
        prisma.animal.count({ where: { status: { in: ['AVAILABLE', 'URGENT'] } } }),
        prisma.animal.count({ where: { status: 'DELISTED' } }),
        prisma.animal.count({ where: { status: 'ADOPTED' } }),
        prisma.shelter.count(),
        prisma.animalAssessment.count({ where: { ageEstimatedLow: { not: null } } }),
        prisma.animal.count({ where: { photoUrl: { not: null } } }),
        // Stale = active but not seen in last 48 hours
        prisma.animal.count({
            where: {
                status: { in: ['AVAILABLE', 'URGENT'] },
                lastSeenAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            },
        }),
        // Enhancement 1: Data quality counts
        prisma.animal.count({ where: { photoUrl: null } }),
        prisma.animal.count({ where: { size: null } }),
        prisma.animal.count({ where: { sex: null } }),
        prisma.animal.count({ where: { assessment: { dataConflicts: { isEmpty: false } } } }),
        prisma.animal.count({ where: { assessment: { visibleConditions: { isEmpty: false } } } }),
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

    // CV confidence breakdown (now on AnimalAssessment)
    const confGroups = await prisma.animalAssessment.groupBy({
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

    // Enhancement 5: State coverage
    // Valid US states + DC + territories
    const VALID_US = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR']);

    const stateGroups = await prisma.shelter.groupBy({
        by: ['state'],
        _count: { state: true },
    });
    const validStateGroups = stateGroups.filter(g => VALID_US.has(g.state));
    const stateAnimalCounts = await Promise.all(
        validStateGroups.map(async (g) => {
            const count = await prisma.animal.count({
                where: {
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    shelter: { is: { state: g.state } },
                },
            });
            return { state: g.state, shelters: g._count.state, animals: count };
        })
    );
    const stateBreakdown = stateAnimalCounts.sort((a, b) => b.animals - a.animals);

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
        withoutPhoto,
        withoutSize,
        withoutSex,
        withConflicts,
        withVisibleConditions,
        stateBreakdown,
        totalStates: validStateGroups.length,
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
    byIntakeReason: { reason: string; count: number }[];
    bySex: { sex: string; count: number }[];
    bySize: { size: string; count: number }[];
    byCareLevel: { level: string; count: number }[];
    withoutName: number;
    withoutAge: number;
    urgentCount: number;
    avgDaysInShelter: number | null;
    recentlyDelisted: RecentAnimal[];
}

export async function getAdminAnimalStats(species?: string): Promise<AdminAnimalStats> {
    const speciesWhere = species ? { species: species as any } : {};
    const [total, withoutName, withoutAge, urgentCount] = await Promise.all([
        prisma.animal.count({ where: speciesWhere }),
        prisma.animal.count({ where: { name: null, ...speciesWhere } }),
        prisma.animal.count({ where: { ageKnownYears: null, assessment: null, ...speciesWhere } }),
        prisma.animal.count({ where: { status: 'URGENT', ...speciesWhere } }),
    ]);

    const bySpecies = (await prisma.animal.groupBy({ by: ['species'], _count: { species: true }, where: speciesWhere }))
        .map(g => ({ species: g.species, count: g._count.species }));

    const byStatus = (await prisma.animal.groupBy({ by: ['status'], _count: { status: true }, where: speciesWhere }))
        .map(g => ({ status: g.status, count: g._count.status }));

    const byAgeSource = (await prisma.animal.groupBy({ by: ['ageSource'], _count: { ageSource: true }, where: speciesWhere }))
        .map(g => ({ source: g.ageSource, count: g._count.ageSource }));

    const photoQualityGroups = await prisma.animalAssessment.groupBy({
        by: ['photoQuality'],
        _count: { photoQuality: true },
        where: { photoQuality: { not: null } },
    });
    const byPhotoQuality = photoQualityGroups
        .map(g => ({ quality: g.photoQuality || 'unknown', count: g._count.photoQuality }));

    // Average days in shelter for active animals
    const activeDays = await prisma.animal.aggregate({
        where: { status: { in: ['AVAILABLE', 'URGENT'] }, daysInShelter: { not: null }, ...speciesWhere },
        _avg: { daysInShelter: true },
    });

    // Recently delisted
    const recentlyDelisted = await prisma.animal.findMany({
        where: { status: 'DELISTED', ...speciesWhere },
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
        ['MUNICIPAL', 'RESCUE', 'NO_KILL', 'FOSTER_BASED'].map(async (type) => {
            const count = await prisma.animal.count({
                where: {
                    status: { in: ['AVAILABLE', 'URGENT'] },
                    shelter: { is: { shelterType: type as any } },
                    ...speciesWhere,
                },
            });
            return { type, count };
        })
    );
    const bySourceType = sourceTypeCounts.filter(s => s.count > 0);

    // Enhancement 2: Intake reason breakdown
    const byIntakeReason = (await prisma.animal.groupBy({ by: ['intakeReason'], _count: { intakeReason: true }, where: speciesWhere }))
        .map(g => ({ reason: g.intakeReason, count: g._count.intakeReason }))
        .sort((a, b) => b.count - a.count);

    // Enhancement 3: Sex & size breakdowns
    const bySex = (await prisma.animal.groupBy({ by: ['sex'], _count: { sex: true }, where: speciesWhere }))
        .map(g => ({ sex: g.sex || 'UNKNOWN', count: g._count.sex }))
        .sort((a, b) => b.count - a.count);

    const bySize = (await prisma.animal.groupBy({
        by: ['size'],
        _count: { size: true },
        where: { size: { not: null }, ...speciesWhere },
    }))
        .map(g => ({ size: g.size || 'UNKNOWN', count: g._count.size }))
        .sort((a, b) => b.count - a.count);

    // Enhancement 4: Care level distribution (now on AnimalAssessment)
    const byCareLevel = (await prisma.animalAssessment.groupBy({
        by: ['estimatedCareLevel'],
        _count: { estimatedCareLevel: true },
        where: { estimatedCareLevel: { not: null } },
    }))
        .map(g => ({ level: g.estimatedCareLevel || 'unknown', count: g._count.estimatedCareLevel }))
        .sort((a, b) => b.count - a.count);

    return {
        total,
        bySpecies,
        byStatus,
        byAgeSource,
        byPhotoQuality,
        bySourceType,
        byIntakeReason,
        bySex,
        bySize,
        byCareLevel,
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

// ─── 24h Delta Stats ──────────────────────────────────────

interface DeltaStats {
    newAnimals: number;
    adopted: number;
    delisted: number;
}

export async function get24hDeltas(): Promise<DeltaStats> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [newAnimals, adopted, delisted] = await Promise.all([
        prisma.animal.count({ where: { createdAt: { gte: cutoff } } }),
        prisma.animal.count({ where: { status: 'ADOPTED', updatedAt: { gte: cutoff } } }),
        prisma.animal.count({ where: { status: 'DELISTED', delistedAt: { gte: cutoff } } }),
    ]);

    return { newAnimals, adopted, delisted };
}

// ─── Scraper Health ──────────────────────────────────────

export interface LatestScrapeRun {
    pipeline: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    durationMs: number | null;
    animalsCreated: number;
    animalsUpdated: number;
    errors: number;
    metadata: Record<string, unknown> | null;
}

export async function getLatestScrapeRuns(): Promise<LatestScrapeRun[]> {
    // Get the latest run per pipeline using raw SQL for DISTINCT ON
    const runs = await prisma.$queryRaw<LatestScrapeRun[]>`
        SELECT DISTINCT ON (pipeline)
            pipeline,
            status,
            started_at AS "startedAt",
            finished_at AS "finishedAt",
            duration_ms AS "durationMs",
            animals_created AS "animalsCreated",
            animals_updated AS "animalsUpdated",
            errors,
            metadata
        FROM scrape_runs
        ORDER BY pipeline, started_at DESC
    `;
    return runs;
}

/**
 * Get recent scrape runs across all pipelines (for data-health history view).
 */
export async function getRecentScrapeRuns(limit = 30): Promise<LatestScrapeRun[]> {
    const runs = await prisma.$queryRaw<LatestScrapeRun[]>`
        SELECT
            pipeline,
            status,
            started_at AS "startedAt",
            finished_at AS "finishedAt",
            duration_ms AS "durationMs",
            animals_created AS "animalsCreated",
            animals_updated AS "animalsUpdated",
            errors,
            metadata
        FROM scrape_runs
        ORDER BY started_at DESC
        LIMIT ${limit}
    `;
    return runs;
}

// ─── Stale Shelters ──────────────────────────────────────

export interface StaleShelter {
    id: string;
    name: string;
    state: string;
    lastScrapedAt: Date | null;
    activeAnimals: number;
}

export async function getStaleShelters(): Promise<StaleShelter[]> {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const shelters = await prisma.shelter.findMany({
        where: {
            OR: [
                { lastScrapedAt: { lt: cutoff } },
                { lastScrapedAt: null },
            ],
        },
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
        orderBy: { lastScrapedAt: 'asc' },
        take: 20,
    });

    return shelters
        .filter(s => s._count.animals > 0) // Only show those with active animals
        .map(s => ({
            id: s.id,
            name: s.name,
            state: s.state,
            lastScrapedAt: s.lastScrapedAt,
            activeAnimals: s._count.animals,
        }));
}

