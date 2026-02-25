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
import { isSenior } from './base-adapter';
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
    };
    meta?: {
        publishTime: string;
        update?: { time: string };
    };
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
            }
            meta {
                publishTime
                update { time }
            }
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
                age: ['SENIOR'],
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
            console.log(`      ${animalType}s: ${total} senior animals, ${totalPages} page(s)`);
        }

        for (const pf of searchResult.animals) {
            const species = mapSpecies(pf.animalType);
            if (species === 'OTHER') continue;

            const size = mapSize(pf.physical?.size?.label);
            const ageYears = parseAge(pf.physical?.age?.value);

            if (!isSenior(ageYears, species, size)) continue;

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

            // Build behavioral notes
            const behaviorParts: string[] = [];
            if (pf.behavior?.houseTrained) behaviorParts.push('House trained');
            const inter = pf.behavior?.interactions;
            if (inter?.cats === true) behaviorParts.push('Good with cats');
            if (inter?.dogs === true) behaviorParts.push('Good with dogs');
            if (inter?.children8AndUp === true || inter?.childrenUnder8 === true) behaviorParts.push('Good with children');
            const behaviorNote = behaviorParts.length > 0 ? behaviorParts.join('. ') + '.' : null;

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
                _shelterId: `petfinder-${config.id}`,
                _shelterName: orgName,
                _shelterCity: orgCity,
                _shelterState: orgState,
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

    for (let i = 0; i < filtered.length; i++) {
        const config = filtered[i];
        shelterMap.set(`petfinder-${config.id}`, {
            name: config.shelterName,
            city: config.city,
            state: config.state,
        });

        if (i % 100 === 0 || i === filtered.length - 1) {
            console.log(`   🏠 [${i + 1}/${filtered.length}] ${config.shelterName} (${config.city}, ${config.state})...`);
        }

        for (const type of ['Dog', 'Cat'] as const) {
            try {
                const animals = await fetchOrgAnimals(config, type);
                allAnimals.push(...animals);
            } catch (err) {
                console.error(`   ❌ ${config.shelterName} ${type}s: ${(err as Error).message?.substring(0, 150)}`);
            }
        }

        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`   Total Petfinder seniors: ${allAnimals.length} from ${shelterMap.size} shelters`);
    return { animals: allAnimals, shelters: shelterMap };
}

export { loadConfig as loadPetfinderConfig };
