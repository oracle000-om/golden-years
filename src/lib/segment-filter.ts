/**
 * GYC segment filter — isolated senior-exclusion logic.
 *
 * Determines which animals qualify as "senior" for the Golden Years Club
 * feed. Only CV-estimated age is authoritative for exclusion; shelter-
 * reported age is never used to remove an animal from results.
 *
 * Mirrors the architecture used by LBC's segment-filter.ts.
 */

import type { AnimalWithShelter } from './types';

// ─── Thresholds ──────────────────────────────────────────

/** Size-aware senior age thresholds for dogs (mirrors scraper/base-adapter). */
export const DOG_SENIOR_BY_SIZE: Record<string, number> = {
    XLARGE: 5,   // giant breeds
    LARGE: 6,
    MEDIUM: 7,
    SMALL: 9,
};

/** Default senior threshold for dogs without a known size or other species. */
const DEFAULT_THRESHOLD = 7;

/** Cat senior threshold. */
const CAT_THRESHOLD = 10;

/**
 * Return the senior age threshold for a given species + size.
 */
export function seniorThreshold(species: string, size: string | null): number {
    if (species === 'CAT') return CAT_THRESHOLD;
    if (species === 'DOG' && size && DOG_SENIOR_BY_SIZE[size] !== undefined) {
        return DOG_SENIOR_BY_SIZE[size];
    }
    return DEFAULT_THRESHOLD;
}

// ─── Per-animal check ────────────────────────────────────

/**
 * Determine if an animal should be excluded from the GYC feed.
 * ONLY the CV age estimate is used — shelter-reported age is not
 * authoritative for exclusion. Animals without a CV assessment
 * are never excluded.
 */
export function shouldExclude(animal: AnimalWithShelter): boolean {
    const threshold = seniorThreshold(animal.species, animal.size);
    const cvHigh = (animal as any).assessment?.ageEstimatedHigh;
    if (cvHigh !== null && cvHigh !== undefined && cvHigh < threshold) return true;
    return false;
}

// ─── Prisma WHERE clause ─────────────────────────────────

/**
 * Build a Prisma NOT clause that excludes animals whose CV estimate
 * confirms they are below the senior threshold for their species/size.
 *
 * Animals without a CV assessment are never excluded by age.
 */
export function buildGYCClause(): Record<string, unknown> {
    return {
        NOT: {
            OR: [
                // Cats: CV high < 10
                { AND: [{ species: 'CAT' }, { assessment: { ageEstimatedHigh: { lt: CAT_THRESHOLD } } }] },
                // Dog XLARGE: CV high < 5
                { AND: [{ species: 'DOG' }, { size: 'XLARGE' }, { assessment: { ageEstimatedHigh: { lt: DOG_SENIOR_BY_SIZE.XLARGE } } }] },
                // Dog LARGE: CV high < 6
                { AND: [{ species: 'DOG' }, { size: 'LARGE' }, { assessment: { ageEstimatedHigh: { lt: DOG_SENIOR_BY_SIZE.LARGE } } }] },
                // Dog MEDIUM: CV high < 7
                { AND: [{ species: 'DOG' }, { size: 'MEDIUM' }, { assessment: { ageEstimatedHigh: { lt: DOG_SENIOR_BY_SIZE.MEDIUM } } }] },
                // Dog SMALL: CV high < 9
                { AND: [{ species: 'DOG' }, { size: 'SMALL' }, { assessment: { ageEstimatedHigh: { lt: DOG_SENIOR_BY_SIZE.SMALL } } }] },
                // Dog unknown size: CV high < 7
                { AND: [{ species: 'DOG' }, { size: null }, { assessment: { ageEstimatedHigh: { lt: DEFAULT_THRESHOLD } } }] },
            ],
        },
    };
}
