/**
 * Petfinder — GraphQL Web Scraper Adapter
 *
 * Fetches senior adoptable animals from Petfinder's internal GraphQL endpoint.
 * The official Petfinder API v2 is sunset — this uses the same public GraphQL
 * endpoint that their Next.js frontend calls.
 *
 * Endpoint: POST https://psl.petfinder.com/graphql
 * Operation: SearchAnimal
 * Auth: None required (public search), needs origin header
 *
 * Config: scraper/config/petfinder-config.json
 */

import type { ScrapedAnimal } from '../types';
import { classifyAgeSegment } from './base-adapter';
import { readFileSync } from 'fs';
import { join } from 'path';

// Petfinder's GraphQL returns raw S3 URLs in _media.s3Url. The S3 bucket
// blocks direct access (403). The same paths are served via CloudFront.
const S3_HOST = 'npus-pr-petfusbbc-pdp-media-service-public-use1-sss.s3.amazonaws.com';
const CF_HOST = 'dbw3zep4prcju.cloudfront.net';

function rewriteS3Url(url: string): string {
    return url.replace(S3_HOST, CF_HOST);
}

// ── Types ──────────────────────────────────────────────

export interface PetfinderConfig {
    id: string;
    shelterName: string;
    petfinderOrgId: string;   // UUID, e.g. "5e20503c-8f3a-44ec-ade5-663c011c7a2a"
    city: string;
    state: string;
}

interface PfOrganization {
    organizationId: string;
    organizationName: string;
    organizationCity: string;
    organizationState: string;
}

interface PfAnimalResponse {
    animalId: string;
    animalName: string;
    animalType: string;       // "Dog", "Cat"
    primaryPhotoId: string | null;
    distance: number | null;
    behavior?: {
        houseTrained: boolean | null;
        specialNeeds: boolean | null;
        interactions?: {
            cats: boolean | null;
            dogs: boolean | null;
            childrenUnder8: boolean | null;
            children8AndUp: boolean | null;
        };
    };
    publicUrl?: { url: string } | null;
    organization?: PfOrganization;
    physical?: {
        breed?: { primary: string | null; secondary: string | null; mixed: boolean };
        age?: { value: string; label: string; rangeLabel: string };
        sex?: string;    // "Male", "Female"
        size?: { label: string };
        coat?: string;   // "Short", "Medium", "Long", "Wire", etc.
        colors?: { primary: string | null; secondary: string | null; tertiary: string | null };
    };
    description?: string | null;
    environment?: {
        cats: boolean | null;
        dogs: boolean | null;
        children: boolean | null;
    };
    meta?: {
        publishTime: string;
        update?: { time: string };
    };
    attributes?: {
        spayedNeutered: boolean | null;
        shotsCurrent: boolean | null;
    };
    tags?: string[];
    _media?: Array<{ s3Url: string }>;
}

interface PfSearchResponse {
    data?: {
        searchAnimal?: {
            totalCount: number;
            timedOut: boolean;
            animals: PfAnimalResponse[];
        };
    };
    errors?: Array<{ message: string }>;
}

// ── Config Loading ─────────────────────────────────────

const CONFIG_PATH = join(__dirname, '../config/petfinder-config.json');

function loadConfig(): PetfinderConfig[] {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as PetfinderConfig[];
}

// ── GraphQL Query (captured from Petfinder's Next.js frontend) ──

const SEARCH_QUERY = `
query SearchAnimal(
    $pagination: PaginationInfoInput!,
    $sort: [SortInput!]!,
    $filters: AnimalSearchFiltersInput!,
    $facets: AnimalSearchFacetsInput
) {
    searchAnimal(
        pagination: $pagination
        sort: $sort
        filters: $filters
        facets: $facets
        isConsumer: true
    ) {
        totalCount
        timedOut
        animals {
            animalId
            animalName
            animalType
            primaryPhotoId
            distance
            description
            behavior {
                houseTrained
                interactions {
                    cats
                    dogs
                    childrenUnder8
                    children8AndUp
                }
            }
            publicUrl { url }
            organization {
                organizationId
                organizationName
                organizationCity
                organizationState
            }
            physical {
                breed { primary secondary mixed }
                age { value label rangeLabel }
                sex
                size { label }
                color { primary secondary tertiary }
            }
            meta {
                publishTime
                update { time }
            }
            tags
            _media { s3Url }
        }
    }
}`;

// ── Species / Size Mapping ─────────────────────────────

function mapSpecies(type: string): 'DOG' | 'CAT' | 'OTHER' {
    const t = type?.toLowerCase();
    if (t === 'dog') return 'DOG';
    if (t === 'cat') return 'CAT';
    return 'OTHER';
}

function mapSize(label: string | undefined): 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null {
    if (!label) return null;
    const s = label.toLowerCase();
    if (s.includes('small')) return 'SMALL';
    if (s.includes('medium')) return 'MEDIUM';
    if (s.includes('extra') || s.includes('xlarge')) return 'XLARGE';
    if (s.includes('large')) return 'LARGE';
    return null;
}

function mapSex(sex: string | undefined): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    if (!sex) return 'UNKNOWN';
    const s = sex.toLowerCase();
    if (s === 'male') return 'MALE';
    if (s === 'female') return 'FEMALE';
    return 'UNKNOWN';
}

function parseAge(ageValue: string | undefined): number | null {
    // Petfinder provides age groups, not exact ages
    if (!ageValue) return null;
    const v = ageValue.toUpperCase();
    if (v === 'SENIOR') return 10;
    if (v === 'ADULT') return 5;
    if (v === 'YOUNG') return 2;
    if (v === 'BABY') return 0;
    return null;
}

// ── Fetching ───────────────────────────────────────────

async function fetchOrgAnimals(
    config: PetfinderConfig,
    animalType: 'Dog' | 'Cat',
): Promise<ScrapedAnimal[]> {
    const animals: ScrapedAnimal[] = [];
    let page = 0;
    const pageSize = 100;
    let totalPages = 1;

    while (page < totalPages) {
        const variables = {
            pagination: { fromPage: page, pageSize },
            sort: [],
            filters: {
                animal_type: [animalType],
                adoption_status: ['ADOPTABLE'],
                record_status: ['PUBLISHED'],
                organization_id: [config.petfinderOrgId],
            },
            facets: { age: '', breeds: '', colors: '', sex: '', size: '' },
        };

        const response = await fetch('https://psl.petfinder.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://www.petfinder.com',
                'Referer': 'https://www.petfinder.com/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                operationName: 'SearchAnimal',
                query: SEARCH_QUERY,
                variables,
            }),
            signal: AbortSignal.timeout(20_000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Petfinder GraphQL ${response.status}: ${errorText.substring(0, 300)}`);
        }

        const result = await response.json() as PfSearchResponse;

        if (result.errors?.length) {
            throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ').substring(0, 200)}`);
        }

        const searchResult = result.data?.searchAnimal;
        if (!searchResult?.animals?.length) break;

        if (page === 0) {
            const total = searchResult.totalCount ?? 0;
            totalPages = Math.min(Math.ceil(total / pageSize), 10); // cap
            console.log(`      ${animalType}s: ${total} animals, ${totalPages} page(s)`);
        }

        for (const pf of searchResult.animals) {
            const species = mapSpecies(pf.animalType);
            if (species === 'OTHER') continue;

            const size = mapSize(pf.physical?.size?.label);
            const ageYears = parseAge(pf.physical?.age?.value);

            // Extract photos and videos from _media (type field removed from schema, infer from URL)
            const media = pf._media || [];
            const VIDEO_EXTS = /\.(mp4|mov|webm|avi|m4v)(\?|$)/i;
            const photos = media
                .filter(m => m.s3Url && !VIDEO_EXTS.test(m.s3Url))
                .map(m => rewriteS3Url(m.s3Url))
                .filter(Boolean);
            const videoMedia = media.find(m => m.s3Url && VIDEO_EXTS.test(m.s3Url));
            const videoUrl = videoMedia ? rewriteS3Url(videoMedia.s3Url) : null;

            if (photos.length === 0) continue;

            const primaryPhoto = photos[0];
            const extraPhotos = photos.slice(1);

            // Build breed string
            const breedParts = [
                pf.physical?.breed?.primary,
                pf.physical?.breed?.secondary,
            ].filter(Boolean);
            const breed = breedParts.length > 0 ? breedParts.join(' / ') : null;

            // Extract structured behavioral data
            const inter = pf.behavior?.interactions;
            const houseTrained = pf.behavior?.houseTrained ?? null;
            const goodWithCats = inter?.cats ?? null;
            const goodWithDogs = inter?.dogs ?? null;
            const goodWithChildren = (inter?.children8AndUp === true || inter?.childrenUnder8 === true)
                ? true
                : (inter?.children8AndUp === false && inter?.childrenUnder8 === false)
                    ? false
                    : null;
            const specialNeeds = null; // Removed from Petfinder schema 2026-02

            // Build environment needs from negative signals
            const envNeeds: string[] = [];
            if (inter?.cats === false) envNeeds.push('No cats');
            if (inter?.dogs === false) envNeeds.push('No dogs');
            if (inter?.childrenUnder8 === false && inter?.children8AndUp === false) envNeeds.push('No children');

            // Extract coat data
            const coatType = null; // Removed from Petfinder schema 2026-02
            const colorParts = [
                (pf.physical as any)?.color?.primary,
                (pf.physical as any)?.color?.secondary,
                (pf.physical as any)?.color?.tertiary,
            ].filter(Boolean) as string[];

            // Build behavioral notes (backward compat for notes field)
            const behaviorParts: string[] = [];
            if (houseTrained) behaviorParts.push('House trained');
            if (goodWithCats) behaviorParts.push('Good with cats');
            if (goodWithDogs) behaviorParts.push('Good with dogs');
            if (goodWithChildren) behaviorParts.push('Good with children');

            // Append Petfinder shelter-assigned tags (e.g., "Playful", "Couch potato")
            const tags = pf.tags?.filter(t => t?.trim()) || [];
            if (tags.length > 0) {
                behaviorParts.push(...tags.map(t => t.trim()));
            }

            const behaviorNote = behaviorParts.length > 0 ? behaviorParts.join('. ') + '.' : null;

            // Full description from Petfinder listing
            const description = pf.description?.trim() || null;

            const org = pf.organization;
            const orgName = org?.organizationName || config.shelterName;
            const orgCity = org?.organizationCity || config.city;
            const orgState = org?.organizationState || config.state;

            animals.push({
                intakeId: `PF-${config.id}-${pf.animalId}`,
                name: pf.animalName?.trim() || null,
                species,
                breed,
                sex: mapSex(pf.physical?.sex),
                size,
                photoUrl: primaryPhoto,
                photoUrls: extraPhotos,
                videoUrl,
                status: 'AVAILABLE',
                ageKnownYears: ageYears,
                ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
                euthScheduledAt: null,
                intakeDate: pf.meta?.publishTime ? new Date(pf.meta.publishTime) : null,
                notes: behaviorNote,
                intakeReason: 'UNKNOWN',
                intakeReasonDetail: null,
                // v6: Structured behavioral data
                houseTrained,
                goodWithCats,
                goodWithDogs,
                goodWithChildren,
                specialNeeds,
                // v6: Coat & appearance
                coatType,
                coatColors: colorParts,
                // v6: Description & environment
                description,
                environmentNeeds: envNeeds,
                // v7: Medical status
                isAltered: null, // attributes removed from Petfinder schema 2026-02
                isVaccinated: null,
                // v7: Listing & physical
                listingUrl: pf.publicUrl?.url || null,
                isMixed: pf.physical?.breed?.mixed ?? null,
                // Internal
                _shelterId: `petfinder-${config.id}`,
                _shelterName: orgName,
                _shelterCity: orgCity,
                _shelterState: orgState,
                ageSegment: classifyAgeSegment(ageYears, species, size),
            });
        }

        page++;
        if (page < totalPages) {
            await new Promise(r => setTimeout(r, 250));
        }
    }

    return animals;
}

// ── Public API ─────────────────────────────────────────

export interface PetfinderScrapeResult {
    animals: ScrapedAnimal[];
    shelters: Map<string, { name: string; city: string; state: string }>;
}

export async function scrapePetfinder(opts?: {
    shelterIds?: string[];
    /** 0-indexed shard number for parallel execution */
    shard?: number;
    /** Total number of shards */
    totalShards?: number;
}): Promise<PetfinderScrapeResult> {
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
        console.warn('   ⚠ No Petfinder shelters configured. Check petfinder-config.json');
        return { animals: [], shelters: new Map() };
    }

    const allAnimals: ScrapedAnimal[] = [];
    const shelterMap = new Map<string, { name: string; city: string; state: string }>();

    // Pre-populate shelter map (cheap, no I/O)
    for (const config of filtered) {
        shelterMap.set(`petfinder-${config.id}`, {
            name: config.shelterName,
            city: config.city,
            state: config.state,
        });
    }

    // Process shelters concurrently with a semaphore
    const SHELTER_CONCURRENCY = 5;
    const SHELTER_TIMEOUT_MS = 60_000;
    let completed = 0;
    let active = 0;
    let timedOut = 0;
    const queue = [...filtered];
    const startMs = Date.now();

    async function processShelter(config: PetfinderConfig): Promise<void> {
        try {
            const shelterAnimals = await Promise.race([
                (async () => {
                    const results: ScrapedAnimal[] = [];
                    for (const type of ['Dog', 'Cat'] as const) {
                        try {
                            const animals = await fetchOrgAnimals(config, type);
                            results.push(...animals);
                        } catch (err) {
                            console.error(`   ❌ ${config.shelterName} ${type}s: ${(err as Error).message?.substring(0, 150)}`);
                        }
                    }
                    return results;
                })(),
                new Promise<ScrapedAnimal[]>((_, reject) =>
                    setTimeout(() => reject(new Error(`Shelter timeout (${SHELTER_TIMEOUT_MS / 1000}s)`)), SHELTER_TIMEOUT_MS)
                ),
            ]);
            allAnimals.push(...shelterAnimals);
        } catch (err) {
            const msg = (err as Error).message?.substring(0, 100) || 'unknown error';
            if (msg.includes('timeout')) timedOut++;
            console.error(`   ❌ ${config.shelterName}: ${msg}`);
        } finally {
            completed++;
            if (completed % 50 === 0 || completed === filtered.length) {
                const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
                console.log(`   📈 Progress: ${completed}/${filtered.length} shelters (${allAnimals.length} animals, ${timedOut} timeouts) — ${elapsed}s`);
            }
        }
    }

    // Semaphore: run up to SHELTER_CONCURRENCY shelters at a time
    await new Promise<void>((resolve) => {
        let idx = 0;

        function scheduleNext(): void {
            while (active < SHELTER_CONCURRENCY && idx < queue.length) {
                const config = queue[idx++];
                active++;
                processShelter(config).finally(() => {
                    active--;
                    if (idx >= queue.length && active === 0) {
                        resolve();
                    } else {
                        // Small stagger between launches to avoid request bursts
                        setTimeout(scheduleNext, 400);
                    }
                });
            }
        }

        scheduleNext();
    });

    console.log(`   Total Petfinder animals: ${allAnimals.length} from ${shelterMap.size} shelters (${timedOut} timed out)`);
    return { animals: allAnimals, shelters: shelterMap };
}

export { loadConfig as loadPetfinderConfig };
