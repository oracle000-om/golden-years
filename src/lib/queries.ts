/**
 * Data access layer — centralized Prisma queries.
 * All database reads go through here so pages stay thin.
 */
import { prisma } from './db';
import type { AnimalWithShelter, AnimalWithShelterAndSources, ShelterWithAnimals } from './types';
import { parseSearchQuery, type SearchIntent } from './search-parser';
import { geocodeZip, geocodeZipFull, geocodeCounty, haversineDistance } from './geocode';
import { zipToState } from './zip-to-state';
import { buildShelterStoryInsights } from './utils';
import { buildGYCClause } from './segment-filter';

// ─── Data quality guards ─────────────────────────────────
/** Names that indicate junk / placeholder records from shelter systems. */
const PLACEHOLDER_NAMES = [
    'Other / Not Listed', 'Not Listed', 'Unknown', 'N/A', 'NA',
    'None', 'TBD', 'No Name', 'Test', 'TEST', 'Unnamed',
];

/**
 * Cross-source dedup: removes duplicate animals scraped from different sources
 * for the same shelter (e.g., Petfinder + RescueGroups + ShelterLuv).
 * Groups by shelter name + animal name + species, keeps the record with the most data.
 */
function deduplicateCrossSource<T extends { name: string | null; species: string; shelter: { name: string }; assessment?: unknown; ageKnownYears: number | null; photoUrl: string | null; breed: string | null }>(animals: T[]): T[] {
    const deduped = new Map<string, T>();
    for (const a of animals) {
        const key = `${a.shelter.name.toLowerCase()}|${(a.name || '').toLowerCase()}|${a.species}`;
        const existing = deduped.get(key);
        if (!existing) {
            deduped.set(key, a);
        } else {
            // Keep the record with more data (assessment, age, photo, breed)
            const score = (r: T) =>
                (r.assessment ? 2 : 0) +
                (r.ageKnownYears !== null ? 1 : 0) +
                (r.photoUrl ? 1 : 0) +
                (r.breed ? 1 : 0);
            if (score(a) > score(existing)) {
                deduped.set(key, a);
            }
        }
    }
    return [...deduped.values()];
}

// ─── Filters ─────────────────────────────────────────────

type SortMode = 'urgency' | 'newest' | 'distance' | 'age';

interface AnimalFilters {
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

/**
 * Raw SQL count — avoids Prisma's query builder which generates heavy JOINs
 * that crash on Vercel's 64MB /dev/shm. This does a simpler count with basic
 * WHERE conditions and a single EXISTS subquery for shelter filters.
 */
async function getFilteredCount(filters: AnimalFilters): Promise<number> {
    const conditions: string[] = [
        `a.status IN ('AVAILABLE', 'URGENT')`,
        `a.species IN ('DOG', 'CAT')`,
        `a.photo_url IS NOT NULL`,
        `a.name NOT IN (${PLACEHOLDER_NAMES.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')})`,
        `(a.intake_date IS NULL OR a.intake_date >= NOW() - INTERVAL '10 years')`,
    ];

    // Shelter filters via EXISTS (avoids full JOIN)
    const shelterConds: string[] = [
        `s.shelter_type != 'SANCTUARY'`,
        `s.state != 'US'`,
        `s.county != 'Unknown'`,
    ];
    if (filters.state && filters.state !== 'all') {
        shelterConds.push(`LOWER(s.state) = LOWER('${filters.state.replace(/'/g, "''")}')`);
    }
    if (filters.source && filters.source !== 'all') {
        if (filters.source === 'municipal') {
            shelterConds.push(`s.shelter_type IN ('MUNICIPAL', 'NO_KILL')`);
        } else if (filters.source === 'rescue') {
            shelterConds.push(`s.shelter_type IN ('RESCUE', 'FOSTER_BASED')`);
        }
    }
    conditions.push(`EXISTS (SELECT 1 FROM shelters s WHERE s.id = a.shelter_id AND ${shelterConds.join(' AND ')})`);

    if (filters.species && filters.species !== 'all') {
        conditions.push(`a.species = '${filters.species.toUpperCase()}'`);
    }
    if (filters.sex && filters.sex !== 'all') {
        conditions.push(`a.sex = '${filters.sex.toUpperCase()}'`);
    }
    if (filters.status === 'urgent') {
        conditions.push(`a.status = 'URGENT'`);
    }

    const sql = `SELECT COUNT(*)::int AS count FROM animals a WHERE ${conditions.join(' AND ')}`;
    const result = await prisma.$queryRawUnsafe<[{ count: number }]>(sql);
    return result[0].count;
}

// ─── Animal Queries ──────────────────────────────────────

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
        // Exclude sanctuary animals and unknown-location shelters from adoption feed
        shelter: { is: { shelterType: { not: 'SANCTUARY' }, state: { not: 'US' }, county: { not: 'Unknown' } } },
        // Exclude listings with implausibly old intake dates (>10 yrs = likely data artifact)
        OR: [
            { intakeDate: null },
            { intakeDate: { gte: new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000) } },
        ],
        // #6: exclude animals confirmed non-senior by both sources
        ...buildGYCClause(),
    };

    if (filters.species && filters.species !== 'all') {
        where.species = filters.species.toUpperCase();
    }

    if (filters.sex && filters.sex !== 'all') {
        where.sex = filters.sex.toUpperCase();
    }

    // Build shelter relation filter conditions
    // Start from the existing shelter filter (sanctuary exclusion is already set)
    const shelterWhere: Record<string, unknown> = (where.shelter as any)?.is
        ? { ...(where.shelter as any).is }
        : {};

    if (filters.state && filters.state !== 'all') {
        shelterWhere.state = { equals: filters.state, mode: 'insensitive' };
    }

    if (filters.source && filters.source !== 'all') {
        // "Shelters" = municipal + no-kill (excludes sanctuary); "Rescues" = rescue + foster-based
        if (filters.source === 'municipal') {
            shelterWhere.shelterType = { in: ['MUNICIPAL', 'NO_KILL'] };
        } else if (filters.source === 'rescue') {
            shelterWhere.shelterType = { in: ['RESCUE', 'FOSTER_BASED'] };
        } else {
            shelterWhere.shelterType = filters.source.toUpperCase();
        }
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
    if (userZip && userZip.length >= 3) {
        // Primary filter: instantly resolve state from zip (bundled lookup, no API)
        const zipState = zipToState(userZip);
        if (zipState && !shelterWhere.state) {
            shelterWhere.state = { equals: zipState, mode: 'insensitive' };
        }

        // Secondary: try geocoding for distance sort/radius features
        if (userZip.length === 5) {
            const fullGeo = await geocodeZipFull(userZip);
            if (fullGeo) {
                userCoords = { lat: fullGeo.lat, lng: fullGeo.lng };
            }
        }
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
        orderBy.push({ euthScheduledAt: { sort: 'asc', nulls: 'last' } });
        orderBy.push({ createdAt: 'desc' });
    } else if (sort === 'newest') {
        orderBy.push({ createdAt: 'desc' });
    } else if (sort === 'age') {
        // Oldest animals first (most at-risk seniors)
        orderBy.push({ ageKnownYears: 'desc' });
        orderBy.push({ createdAt: 'desc' });
    } else {
        // 'distance' — we'll sort in-memory after computing distances
        orderBy.push({ createdAt: 'desc' });
    }

    // For distance sort or radius filtering, we need to fetch a broader
    // window and paginate in-memory after computing distances.
    const needsDistanceSort = sort === 'distance' && userCoords;
    const needsRadiusFilter = userCoords && filters.radius !== 'any';
    const needsInMemoryPagination = needsDistanceSort || needsRadiusFilter;

    // When we need in-memory pagination, fetch a larger window from DB.
    const DISTANCE_WINDOW = 500;
    const skip = needsInMemoryPagination ? 0 : (page - 1) * DEFAULT_PAGE_SIZE;
    const take = needsInMemoryPagination ? DISTANCE_WINDOW : DEFAULT_PAGE_SIZE;

    // Fetch listing data
    const dbAnimals = await prisma.animal.findMany({
        where,
        include: { shelter: true, assessment: true },
        orderBy,
        skip,
        take,
    }) as AnimalWithShelter[];

    // Get total count — skip separate count query when NLP search is active
    // (search filters aren't handled by the raw SQL counter, and the extra
    // query doubles memory pressure, risking /dev/shm crashes).
    let totalCount: number;
    if (searchIntent) {
        // Estimate from findMany results when searching
        totalCount = dbAnimals.length < take
            ? skip + dbAnimals.length
            : skip + take + 1;
    } else {
        try {
            totalCount = await getFilteredCount(filters);
        } catch {
            // If raw count also fails, estimate from results
            totalCount = dbAnimals.length < take
                ? skip + dbAnimals.length
                : skip + take + 1;
        }
    }

    let animals: AnimalResult[] = dbAnimals as AnimalResult[];

    // Cross-source dedup (same animal at same shelter from different scrapers)
    const dedupedAnimals = deduplicateCrossSource(animals);
    if (dedupedAnimals.length < animals.length) {
        totalCount = Math.max(0, totalCount - (animals.length - dedupedAnimals.length));
        animals = dedupedAnimals;
    }

    // Compute distances for results
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

        // Radius filter: remove animals beyond the user's radius
        if (filters.radius !== 'any') {
            animals = animals.filter(a => a.distance !== undefined && a.distance <= radius);
            totalCount = animals.length; // true count within radius (up to DISTANCE_WINDOW)
        }

        // Distance sort: sort all fetched animals by distance, then paginate
        if (sort === 'distance') {
            animals.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
        }
    }

    // In-memory pagination when we fetched a larger window
    if (needsInMemoryPagination) {
        const inMemorySkip = (page - 1) * DEFAULT_PAGE_SIZE;
        animals = animals.slice(inMemorySkip, inMemorySkip + DEFAULT_PAGE_SIZE);
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
                { assessment: { ageEstimatedLow: { gte: intent.minAge } } },
            ],
        });
    }

    // Age: maxAge (e.g. "under 8")
    if (intent.maxAge !== null) {
        andClauses.push({
            OR: [
                { ageKnownYears: { lte: intent.maxAge } },
                { assessment: { ageEstimatedHigh: { lte: intent.maxAge } } },
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
        andClauses.push({ assessment: { estimatedCareLevel: intent.careLevel } });
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
        // Exclude sanctuary animals and unknown-location shelters from search results
        shelter: { is: { shelterType: { not: 'SANCTUARY' }, state: { not: 'US' }, county: { not: 'Unknown' } } },
        // Exclude listings with implausibly old intake dates
        OR: [
            { intakeDate: null },
            { intakeDate: { gte: new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000) } },
        ],
        // Exclude confirmed non-seniors at DB level
        ...buildGYCClause(),
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

    // Cross-source dedup
    const dedupedResults = deduplicateCrossSource(animals);

    // For non-wait sorts, apply urgency-first sort in app layer
    if (!intent.sortByWait) {
        return dedupedResults.sort((a, b) => {
            const aEuth = a.euthScheduledAt ? new Date(a.euthScheduledAt).getTime() : Infinity;
            const bEuth = b.euthScheduledAt ? new Date(b.euthScheduledAt).getTime() : Infinity;
            return aEuth - bEuth;
        });
    }

    return dedupedResults;
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
            assessment: true,
            enrichment: true,
            listing: true,
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
    if (shelter.totalIntakeAnnual > 0 && shelter.totalEuthanizedAnnual >= 0) {
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
            insights.push('This is a no-kill organization');
        } else if (shelter.shelterType === 'FOSTER_BASED') {
            insights.push('Foster-based rescue — these seniors are living in homes, not kennels');
        } else if (shelter.shelterType === 'SANCTUARY') {
            insights.push('This is a sanctuary — animals here are permanent residents');
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

/** Fetch a shelter by ID with its available/urgent animals and financials. */
export async function getShelterById(id: string): Promise<ShelterWithAnimals | null> {
    return prisma.shelter.findUnique({
        where: { id },
        include: {
            animals: {
                where: { status: { in: ['AVAILABLE', 'URGENT'] } },
                orderBy: { createdAt: 'desc' },
            },
            financials: true,
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
    const found = await prisma.animal.findFirst({
        where: {
            status: { in: ['AVAILABLE', 'URGENT'] },
            euthScheduledAt: { gte: new Date() },
        },
        select: { id: true },
    });
    return found !== null;
}

// Valid US states + DC + territories (excludes Canadian provinces like ON, BC, AB, etc.)
const VALID_US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC', 'PR',
]);

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
        .filter((s) => VALID_US_STATES.has(s))
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
    shelterType: string;
    saveRate: number;       // 0–100
    yearsRunning: number;   // consecutive no-kill years (≥ 1)
    dataYear: number | null;
    animalCount: number;    // available/urgent animals currently listed
}

/**
 * Fetch shelters that have achieved "no-kill" status (≥ 90% save rate)
 * based on publicly available intake/euthanasia data.
 * Only includes shelters whose no-kill status can be verified from stats.
 * Uses prior-year data to determine consecutive years.
 */
export async function getNoKillShelters(): Promise<{
    shelters: NoKillShelter[];
    noKillPercent: number;
    totalWithData: number;
}> {
    const allShelters = await prisma.shelter.findMany({
        where: {
            totalIntakeAnnual: { gt: 0 },
            shelterType: 'MUNICIPAL',
        },
        select: {
            id: true,
            name: true,
            state: true,
            county: true,
            websiteUrl: true,
            shelterType: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            dataYear: true,
            priorYearIntake: true,
            priorYearEuthanized: true,
            priorDataYear: true,
            _count: {
                select: {
                    animals: {
                        where: { status: { in: ['AVAILABLE', 'URGENT'] } },
                    },
                },
            },
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
            shelterType: s.shelterType,
            saveRate,
            yearsRunning,
            dataYear: s.dataYear,
            animalCount: s._count.animals,
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

/** Fetch all active polls, ordered by relevance to seniors. */
export async function getActivePolls() {
    return prisma.poll.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
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

/** Fetch state policy for report card (adopter-relevant fields only). */
export async function getStatePolicyForShelter(state: string) {
    return prisma.statePolicy.findUnique({
        where: { state: state.toUpperCase() },
        select: {
            holdingPeriodDays: true,
            spayNeuterRequired: true,
            mandatoryReporting: true,
            reportingBody: true,
        },
    });
}

/**
 * Fetch enriched storytelling insights for the shelter detail page.
 * Pulls from shelter stats, financials, state policy, and live inventory.
 */
export async function getShelterStoryInsights(shelterId: string): Promise<string[]> {
    const shelter = await prisma.shelter.findUnique({
        where: { id: shelterId },
        select: {
            shelterType: true,
            state: true,
            totalIntakeAnnual: true,
            totalEuthanizedAnnual: true,
            dataYear: true,
            countyPopulation: true,
            totalTransferred: true,
            priorYearIntake: true,
            priorYearEuthanized: true,
            priorDataYear: true,
        },
    });
    if (!shelter) return [];

    // Fetch financials
    const financials = await prisma.shelterFinancials.findUnique({
        where: { shelterId },
        select: {
            taxPeriod: true,
            totalRevenue: true,
            totalExpenses: true,
            contributions: true,
            programRevenue: true,
            fundraisingExpense: true,
            officerCompensation: true,
        },
    });

    // Fetch state policy
    const statePolicy = await prisma.statePolicy.findUnique({
        where: { state: shelter.state.toUpperCase() },
        select: {
            holdingPeriodDays: true,
            mandatoryReporting: true,
            reportingBody: true,
        },
    });

    // Compute average days waiting for current animals
    const animals = await prisma.animal.findMany({
        where: { shelterId, status: { in: ['AVAILABLE', 'URGENT'] } },
        select: { intakeDate: true },
    });
    let avgDaysWaiting: number | null = null;
    const animalsWithDates = animals.filter(a => a.intakeDate);
    if (animalsWithDates.length > 0) {
        const now = Date.now();
        const totalDays = animalsWithDates.reduce((sum, a) => {
            return sum + Math.max(0, Math.floor((now - new Date(a.intakeDate!).getTime()) / 86_400_000));
        }, 0);
        avgDaysWaiting = Math.round(totalDays / animalsWithDates.length);
    }

    return buildShelterStoryInsights({
        shelter,
        financials,
        statePolicy,
        avgDaysWaiting,
    });
}
