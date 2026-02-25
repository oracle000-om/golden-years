/**
 * Data access layer — centralized Prisma queries.
 * All database reads go through here so pages stay thin.
 */
import { prisma } from './db';
import type { AnimalWithShelter, AnimalWithShelterAndSources, ShelterWithAnimals } from './types';
import { parseSearchQuery, type SearchIntent } from './search-parser';
import { geocodeZip, geocodeZipFull, geocodeCounty, haversineDistance } from './geocode';

// ─── Data quality guards ─────────────────────────────────
/** Names that indicate junk / placeholder records from shelter systems. */
const PLACEHOLDER_NAMES = [
    'Other / Not Listed', 'Not Listed', 'Unknown', 'N/A', 'NA',
    'None', 'TBD', 'No Name', 'Test', 'TEST', 'Unnamed',
];

// ─── Filters ─────────────────────────────────────────────

export type SortMode = 'urgency' | 'newest' | 'distance' | 'age';

export interface AnimalFilters {
    species?: string;
    sex?: string;
    state?: string;
    time?: string;
    q?: string;
    zip?: string;
    sort?: string;
    page?: string;
    radius?: string;
    source?: string;
    status?: string;
}

export interface AnimalResult extends AnimalWithShelter {
    distance?: number; // miles from user, when location is available
}

export interface PaginatedResult {
    animals: AnimalResult[];
    totalCount: number;
    page: number;
    totalPages: number;
    pageSize: number;
}

const DEFAULT_PAGE_SIZE = 24;
const DEFAULT_RADIUS = 100; // miles

// ─── Animal Queries ──────────────────────────────────────

/**
 * Size-aware senior age thresholds for dogs (mirrors scraper/base-adapter).
 */
const DOG_SENIOR_BY_SIZE: Record<string, number> = {
    XLARGE: 5,   // giant breeds
    LARGE: 6,
    MEDIUM: 7,
    SMALL: 9,
};

function seniorThreshold(species: string, size: string | null): number {
    if (species === 'CAT') return 10;
    if (species === 'DOG' && size && DOG_SENIOR_BY_SIZE[size] !== undefined) {
        return DOG_SENIOR_BY_SIZE[size];
    }
    return 7; // default for dogs w/o size, OTHER
}

/**
 * Determine if an animal should be excluded — EITHER the shelter-reported age
 * OR our CV age estimate indicates the animal is NOT a senior.
 * CV analyzes the actual photo, so it's authoritative on its own.
 */
function _shouldExclude(animal: AnimalWithShelter): boolean {
    const threshold = seniorThreshold(animal.species, animal.size);
    if (animal.ageKnownYears !== null && animal.ageKnownYears < threshold) return true;
    if (animal.ageEstimatedHigh !== null && animal.ageEstimatedHigh < threshold) return true;
    return false;
}

/**
 * Build a NOT clause that excludes animals where EITHER the shelter-reported
 * age OR the CV estimate says the animal is below the senior threshold.
 * CV analyzes the actual photo and should be trusted on its own.
 */
function buildSeniorExclusionClause(): Record<string, unknown> {
    return {
        NOT: {
            OR: [
                // --- CV estimate says not senior (any species/size) ---
                // Cats: CV high < 10
                { AND: [{ species: 'CAT' }, { ageEstimatedHigh: { lt: 10, not: null } }] },
                // Dog XLARGE: CV high < 5
                { AND: [{ species: 'DOG' }, { size: 'XLARGE' }, { ageEstimatedHigh: { lt: 5, not: null } }] },
                // Dog LARGE: CV high < 6
                { AND: [{ species: 'DOG' }, { size: 'LARGE' }, { ageEstimatedHigh: { lt: 6, not: null } }] },
                // Dog MEDIUM: CV high < 7
                { AND: [{ species: 'DOG' }, { size: 'MEDIUM' }, { ageEstimatedHigh: { lt: 7, not: null } }] },
                // Dog SMALL: CV high < 9
                { AND: [{ species: 'DOG' }, { size: 'SMALL' }, { ageEstimatedHigh: { lt: 9, not: null } }] },
                // Dog unknown size: CV high < 7
                { AND: [{ species: 'DOG' }, { size: null }, { ageEstimatedHigh: { lt: 7, not: null } }] },
                // --- Shelter-reported age says not senior (no CV data) ---
                // Cats: shelter < 10, no CV
                { AND: [{ species: 'CAT' }, { ageKnownYears: { lt: 10, not: null } }, { ageEstimatedHigh: null }] },
                // Dog XLARGE: shelter < 5, no CV
                { AND: [{ species: 'DOG' }, { size: 'XLARGE' }, { ageKnownYears: { lt: 5, not: null } }, { ageEstimatedHigh: null }] },
                // Dog LARGE: shelter < 6, no CV
                { AND: [{ species: 'DOG' }, { size: 'LARGE' }, { ageKnownYears: { lt: 6, not: null } }, { ageEstimatedHigh: null }] },
                // Dog MEDIUM: shelter < 7, no CV
                { AND: [{ species: 'DOG' }, { size: 'MEDIUM' }, { ageKnownYears: { lt: 7, not: null } }, { ageEstimatedHigh: null }] },
                // Dog SMALL: shelter < 9, no CV
                { AND: [{ species: 'DOG' }, { size: 'SMALL' }, { ageKnownYears: { lt: 9, not: null } }, { ageEstimatedHigh: null }] },
                // Dog unknown size: shelter < 7, no CV
                { AND: [{ species: 'DOG' }, { size: null }, { ageKnownYears: { lt: 7, not: null } }, { ageEstimatedHigh: null }] },
            ],
        },
    };
}

/** Fetch filtered, sorted, paginated animal listings with distance. */
export async function getFilteredAnimals(filters: AnimalFilters): Promise<PaginatedResult> {
    // Status filter: default to both, narrow to URGENT-only when requested
    const statusFilter = filters.status === 'urgent'
        ? { in: ['URGENT'] }
        : { in: ['AVAILABLE', 'URGENT'] };

    const where: Record<string, unknown> = {
        status: statusFilter,
        species: { in: ['DOG', 'CAT'] },
        photoUrl: { not: null },
        name: { notIn: PLACEHOLDER_NAMES },
        // #6: exclude animals confirmed non-senior by both sources
        ...buildSeniorExclusionClause(),
    };

    if (filters.species && filters.species !== 'all') {
        where.species = filters.species.toUpperCase();
    }

    if (filters.sex && filters.sex !== 'all') {
        where.sex = filters.sex.toUpperCase();
    }

    // Build shelter relation filter conditions
    const shelterWhere: Record<string, unknown> = {};

    if (filters.state && filters.state !== 'all') {
        shelterWhere.state = { equals: filters.state, mode: 'insensitive' };
    }

    if (filters.source && filters.source !== 'all') {
        shelterWhere.shelterType = filters.source.toUpperCase();
    }

    // Timeframe filter
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

    // NLP search
    let searchIntent: SearchIntent | null = null;
    if (filters.q && filters.q.trim()) {
        searchIntent = parseSearchQuery(filters.q);
        await applySearchIntent(where, searchIntent);
    }

    // Parse sort and page
    const sort: SortMode = (['urgency', 'newest', 'distance', 'age'].includes(filters.sort || '')
        ? filters.sort as SortMode
        : 'urgency');
    const page = Math.max(1, parseInt(filters.page || '1', 10) || 1);
    const radius = parseInt(filters.radius || '', 10) || DEFAULT_RADIUS;

    // Resolve user location for distance sorting/filtering
    const userZip = filters.zip?.trim() || searchIntent?.zip || null;
    let userCoords: { lat: number; lng: number } | null = null;
    let userState: string | null = null;
    if (userZip) {
        const fullGeo = await geocodeZipFull(userZip);
        if (fullGeo) {
            userCoords = { lat: fullGeo.lat, lng: fullGeo.lng };
            userState = fullGeo.state;
        }
    }

    // If user provided a zip and we know their state, add state-level DB filter
    // (unless a state dropdown is already set — don't override explicit choice)
    if (userState && !shelterWhere.state) {
        shelterWhere.state = { equals: userState, mode: 'insensitive' };
    }

    if (Object.keys(shelterWhere).length > 0) {
        where.shelter = { is: shelterWhere };
    }

    // Determine Prisma orderBy based on sort mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any[] = [];
    if (searchIntent?.sortByWait) {
        // NLP "longest wait" query — override sort to intake date ascending
        orderBy.push({ intakeDate: { sort: 'asc', nulls: 'last' } });
    } else if (sort === 'urgency') {
        // #1: DB-level urgency sort — euth dates first (ascending),
        // then all others sorted by newest. Avoids full-table scan.
        orderBy.push({ euthScheduledAt: { sort: 'asc', nulls: 'last' } });
        orderBy.push({ createdAt: 'desc' });
    } else if (sort === 'newest') {
        orderBy.push({ createdAt: 'desc' });
    } else if (sort === 'age') {
        // Oldest animals first (most at-risk seniors)
        orderBy.push({ ageKnownYears: 'desc' });
        orderBy.push({ createdAt: 'desc' });
    } else {
        // 'distance' — DB-sorted by createdAt, re-sorted post-query
        orderBy.push({ createdAt: 'desc' });
    }

    // DB-level pagination for all sort modes
    const skip = (page - 1) * DEFAULT_PAGE_SIZE;

    const [dbAnimals, count] = await Promise.all([
        prisma.animal.findMany({
            where,
            include: { shelter: true },
            orderBy,
            skip,
            take: DEFAULT_PAGE_SIZE,
        }) as Promise<AnimalWithShelter[]>,
        prisma.animal.count({ where }),
    ]);

    let animals: AnimalResult[] = dbAnimals as AnimalResult[];
    let totalCount = count;

    // Compute distances for the page of results
    if (userCoords && animals.length > 0) {
        // Collect unique shelter location keys for geocoding
        const shelterLocations = new Map<string, { zip?: string; county?: string; state?: string }>();
        for (const a of animals) {
            if (a.shelter.latitude && a.shelter.longitude) continue; // already has coords
            const key = a.shelter.zipCode || `${a.shelter.county}|${a.shelter.state}`;
            if (!shelterLocations.has(key)) {
                shelterLocations.set(key, {
                    zip: a.shelter.zipCode || undefined,
                    county: a.shelter.county || undefined,
                    state: a.shelter.state || undefined,
                });
            }
        }

        // Geocode shelter locations (zip preferred, county+state fallback)
        const locationCoords = new Map<string, { lat: number; lng: number } | null>();
        for (const [key, loc] of shelterLocations) {
            if (loc.zip) {
                locationCoords.set(key, await geocodeZip(loc.zip));
            } else if (loc.county && loc.state) {
                locationCoords.set(key, await geocodeCounty(loc.county, loc.state));
            }
        }

        // Compute distances
        for (const animal of animals) {
            let sLat = animal.shelter.latitude;
            let sLng = animal.shelter.longitude;

            // Fall back to geocoded coordinates
            if (!sLat || !sLng) {
                const key = animal.shelter.zipCode || `${animal.shelter.county}|${animal.shelter.state}`;
                const coords = locationCoords.get(key);
                if (coords) {
                    sLat = coords.lat;
                    sLng = coords.lng;
                }
            }

            if (sLat && sLng) {
                animal.distance = Math.round(
                    haversineDistance(userCoords.lat, userCoords.lng, sLat, sLng) * 10
                ) / 10;
            }
        }

        // If sort is distance, re-sort by computed distance
        if (sort === 'distance') {
            animals.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
        }

        // Post-query radius filter: remove animals beyond the user's radius
        if (filters.radius !== 'any') {
            animals = animals.filter(a => a.distance !== undefined && a.distance <= radius);
            // We can't accurately count total radius-filtered results without
            // geocoding every shelter in the state, so cap to what this page shows
            totalCount = animals.length;
        }
    }

    return {
        animals,
        totalCount,
        page,
        totalPages: Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE)),
        pageSize: DEFAULT_PAGE_SIZE,
    };
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
            shelter: { is: { state: { equals: intent.state, mode: 'insensitive' } } },
        });
    }

    // City — match against shelter county, name, or address
    if (intent.city) {
        andClauses.push({
            OR: [
                { shelter: { is: { county: { contains: intent.city, mode: 'insensitive' } } } },
                { shelter: { is: { name: { contains: intent.city, mode: 'insensitive' } } } },
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
            shelter: { is: { zipCode: { startsWith: intent.zip } } },
        });
    }

    // Care level filter
    if (intent.careLevel) {
        andClauses.push({ estimatedCareLevel: intent.careLevel });
    }

    // Remaining text tokens — each must match somewhere (AND logic)
    for (const token of intent.textTokens) {
        andClauses.push({
            OR: [
                { name: { contains: token, mode: 'insensitive' } },
                { breed: { contains: token, mode: 'insensitive' } },
                { shelter: { is: { name: { contains: token, mode: 'insensitive' } } } },
                { shelter: { is: { county: { contains: token, mode: 'insensitive' } } } },
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
        status: { in: ['AVAILABLE', 'URGENT'] },
        species: { in: ['DOG', 'CAT'] },
        photoUrl: { not: null },
        name: { notIn: PLACEHOLDER_NAMES },
        // Exclude confirmed non-seniors at DB level
        ...buildSeniorExclusionClause(),
    };

    await applySearchIntent(where, intent);

    // Determine ordering: sort-by-wait overrides default urgency sort
    const orderBy = intent.sortByWait
        ? [{ intakeDate: { sort: 'asc' as const, nulls: 'last' as const } }]
        : [{ euthScheduledAt: { sort: 'asc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }];

    // #2: Cap results to prevent unbounded memory usage on broad queries
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animals = await (prisma.animal.findMany as any)({
        where,
        include: { shelter: true },
        orderBy,
        take: 100,
    }) as AnimalWithShelter[];

    // For non-wait sorts, apply urgency-first sort in app layer
    if (!intent.sortByWait) {
        return animals.sort((a, b) => {
            const aEuth = a.euthScheduledAt ? new Date(a.euthScheduledAt).getTime() : Infinity;
            const bEuth = b.euthScheduledAt ? new Date(b.euthScheduledAt).getTime() : Infinity;
            return aEuth - bEuth;
        });
    }

    return animals;
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
            status: { in: ['AVAILABLE', 'URGENT'] },
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

/**
 * Compute evergreen insights about a shelter based on annual stats.
 * Avoids current-inventory data that changes daily — those insights
 * belong on a dedicated shelter page with proper time-framing.
 */
export async function getShelterInsights(shelterId: string): Promise<string[]> {
    const shelter = await prisma.shelter.findUnique({
        where: { id: shelterId },
        select: {
            shelterType: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            dataYear: true,
            priorYearIntake: true,
            priorYearEuthanized: true,
            priorDataYear: true,
        },
    });

    if (!shelter) return [];

    const insights: string[] = [];

    // ── 1. Save rate ──
    if (shelter.totalIntakeAnnual > 0 && shelter.totalEuthanizedAnnual > 0) {
        const saveRate = Math.round(
            ((shelter.totalIntakeAnnual - shelter.totalEuthanizedAnnual) / shelter.totalIntakeAnnual) * 100
        );
        const yearLabel = shelter.dataYear ? ` in ${shelter.dataYear}` : '';
        if (saveRate >= 90) {
            insights.push(`This shelter has a ${saveRate}% save rate${yearLabel}`);
        } else if (saveRate < 70) {
            insights.push(`Save rate${yearLabel} is ${saveRate}% — higher-risk for seniors`);
        }
    }

    // ── 2. Year-over-year intake trend ──
    if (shelter.priorYearIntake && shelter.priorYearIntake > 0 && shelter.totalIntakeAnnual > 0) {
        const delta = shelter.totalIntakeAnnual - shelter.priorYearIntake;
        const pctChange = Math.round((delta / shelter.priorYearIntake) * 100);
        if (Math.abs(pctChange) >= 10) {
            const direction = pctChange > 0 ? 'up' : 'down';
            const fromYear = shelter.priorDataYear ?? '?';
            const toYear = shelter.dataYear ?? '?';
            insights.push(`Intake ${direction} ${Math.abs(pctChange)}% from ${fromYear} to ${toYear}`);
        }
    }

    // ── 3. Euthanasia trend ──
    if (shelter.priorYearEuthanized && shelter.priorYearEuthanized > 0 && shelter.totalEuthanizedAnnual > 0) {
        const delta = shelter.totalEuthanizedAnnual - shelter.priorYearEuthanized;
        const pctChange = Math.round((delta / shelter.priorYearEuthanized) * 100);
        if (pctChange <= -15) {
            insights.push(`Euthanasia down ${Math.abs(pctChange)}% year-over-year — positive trend`);
        } else if (pctChange >= 15) {
            insights.push(`Euthanasia up ${pctChange}% year-over-year — concerning trend`);
        }
    }

    // ── 4. Shelter type context ──
    if (insights.length < 3) {
        if (shelter.shelterType === 'RESCUE') {
            insights.push('This is a rescue — animals here were pulled from other shelters');
        } else if (shelter.shelterType === 'NO_KILL') {
            insights.push('This is a no-kill shelter — committed to saving at least 90% of animals');
        } else if (shelter.shelterType === 'FOSTER_BASED') {
            insights.push('Foster-based rescue — these seniors are living in homes, not kennels');
        }
    }

    return insights.slice(0, 5);
}

/** Fetch minimal animal data for metadata generation (no sources needed). */
export async function getAnimalForMetadata(id: string) {
    return prisma.animal.findUnique({
        where: { id },
        include: { shelter: true },
    });
}

// ─── Shelter Queries ─────────────────────────────────────

/** Fetch a shelter by ID with its available/urgent animals. */
export async function getShelterById(id: string): Promise<ShelterWithAnimals | null> {
    return prisma.shelter.findUnique({
        where: { id },
        include: {
            animals: {
                where: { status: { in: ['AVAILABLE', 'URGENT'] } },
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
                where: { status: { in: ['AVAILABLE', 'URGENT'] } },
            },
        },
    });
}

/** Check if any active animals have a future euthanasia date scheduled. */
export async function hasEuthScheduledAnimals(): Promise<boolean> {
    const count = await prisma.animal.count({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            euthScheduledAt: { gte: new Date() },
        },
        take: 1,
    });
    return count > 0;
}

/** Fetch distinct states that have shelters with active (AVAILABLE/URGENT) animals. */
export async function getDistinctStates(): Promise<string[]> {
    const shelters = await prisma.shelter.findMany({
        where: {
            animals: {
                some: { status: { in: ['AVAILABLE', 'URGENT'] } },
            },
        },
        select: { state: true },
    });
    const unique = [...new Set(shelters.map((s) => s.state.toUpperCase()))]
        .filter((s) => /^[A-Z]{2}$/.test(s))
        .sort();
    return unique;
}

// ─── Wall of Fame (No-Kill Shelters) ─────────────────────

export interface NoKillShelter {
    id: string;
    name: string;
    state: string;
    county: string;
    websiteUrl: string | null;
    saveRate: number;       // 0–100
    yearsRunning: number;   // consecutive no-kill years (≥ 1)
    dataYear: number | null;
}

/**
 * Fetch shelters that have achieved "no-kill" status (≥ 90% save rate)
 * based on their most recent annual data. Uses prior-year data to
 * determine how many consecutive years they've held the status.
 * Also returns the % of data-bearing shelters that qualify.
 */
export async function getNoKillShelters(): Promise<{
    shelters: NoKillShelter[];
    noKillPercent: number;
    totalWithData: number;
}> {
    const allShelters = await prisma.shelter.findMany({
        where: {
            totalIntakeAnnual: { gt: 0 },
        },
        select: {
            id: true,
            name: true,
            state: true,
            county: true,
            websiteUrl: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            dataYear: true,
            priorYearIntake: true,
            priorYearEuthanized: true,
            priorDataYear: true,
        },
        orderBy: { name: 'asc' },
    });

    const noKill: NoKillShelter[] = [];

    for (const s of allShelters) {
        const euthRate = s.totalEuthanizedAnnual / s.totalIntakeAnnual;
        if (euthRate >= 0.10) continue; // not no-kill

        const saveRate = Math.round((1 - euthRate) * 100);

        // Determine consecutive years
        let yearsRunning = 1;
        if (
            s.priorYearIntake && s.priorYearIntake > 0 &&
            s.priorYearEuthanized !== null && s.priorYearEuthanized !== undefined
        ) {
            const priorRate = s.priorYearEuthanized / s.priorYearIntake;
            if (priorRate < 0.10) {
                yearsRunning = 2; // at least 2 consecutive years
            }
        }

        noKill.push({
            id: s.id,
            name: s.name,
            state: s.state,
            county: s.county,
            websiteUrl: s.websiteUrl,
            saveRate,
            yearsRunning,
            dataYear: s.dataYear,
        });
    }

    // Sort by save rate (highest first), then alphabetically
    noKill.sort((a, b) => b.saveRate - a.saveRate || a.name.localeCompare(b.name));

    const totalWithData = allShelters.length;
    const noKillPercent = totalWithData > 0
        ? Math.round((noKill.length / totalWithData) * 100)
        : 0;

    return { shelters: noKill, noKillPercent, totalWithData };
}

// ─── Poll Queries ────────────────────────────────────────

/** Fetch all active polls, newest first. */
export async function getActivePolls() {
    return prisma.poll.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
    });
}

// ─── Snapshot Queries ────────────────────────────────────

/** Fetch temporal snapshots for an animal, newest first. */
export async function getAnimalSnapshots(animalId: string) {
    return prisma.animalSnapshot.findMany({
        where: { animalId },
        orderBy: { scrapedAt: 'desc' },
        take: 50, // cap at 50 snapshots
    });
}

/** Look up breed-typical health conditions from BreedProfile table. */
export async function getBreedCommonConditions(breedNames: string[]): Promise<string[]> {
    if (breedNames.length === 0) return [];
    const profiles = await prisma.breedProfile.findMany({
        where: {
            OR: breedNames.map(name => ({
                name: { contains: name, mode: 'insensitive' as const },
            })),
        },
        select: { commonConditions: true },
    });
    const conditions = profiles.flatMap(p => p.commonConditions);
    return [...new Set(conditions)];
}
