/**
 * Base Adapter — Shared utilities for all shelter scraper adapters
 *
 * Provides brittleness mitigation:
 *   - safeFetch: retries, timeouts, response validation
 *   - validateAnimal: schema validation for ScrapedAnimal
 *   - isSenior: centralized age threshold (7 dogs, 10 cats)
 *   - withHealthReport: HOF wrapping adapters with error tracking
 */

import type { ScrapedAnimal } from '../types';

// ── Constants ──────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;
const USER_AGENT = 'GoldenYearsClub/1.0 (shelter-data-aggregator)';

/** Default senior age threshold by species (no size info available) */
export const SENIOR_AGE: Record<string, number> = {
    DOG: 7,
    CAT: 10,
    OTHER: 7,
};

/**
 * Size-specific senior age thresholds for dogs.
 * Giant breeds age fastest, toy breeds slowest.
 *
 * Giant (Great Dane, Mastiff, St. Bernard)    → 5 years
 * Large (Lab, GSD, Golden, Rottweiler)        → 6 years
 * Medium (Beagle, Aussie, Border Collie)      → 7 years (default)
 * Small (Corgi, Dachshund, Mini Poodle)       → 9 years
 * Toy (Chihuahua, Pomeranian, Yorkie)         → 10 years
 */
const DOG_SENIOR_BY_SIZE: Record<string, number> = {
    XLARGE: 5,   // giant breeds
    LARGE: 6,
    MEDIUM: 7,
    SMALL: 9,
};

// ── safeFetch ──────────────────────────────────────────

export interface SafeFetchOptions {
    /** Timeout per attempt in ms (default: 15s) */
    timeoutMs?: number;
    /** Number of retry attempts (default: 3) */
    retries?: number;
    /** Additional headers */
    headers?: Record<string, string>;
    /** HTTP method (default: GET) */
    method?: string;
    /** Request body */
    body?: string;
    /** Expected content type prefix (e.g. 'application/json', 'text/xml'). Rejects mismatches. */
    expectContentType?: string;
}

/**
 * Fetch with automatic retry, exponential backoff, timeout, and response validation.
 * Returns the Response object on success, throws on all retries exhausted.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retries = DEFAULT_RETRIES,
        headers = {},
        method = 'GET',
        body,
        expectContentType,
    } = opts;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method,
                headers: { 'User-Agent': USER_AGENT, ...headers },
                body,
                signal: AbortSignal.timeout(timeoutMs),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            // Validate content type if expected
            if (expectContentType) {
                const ct = response.headers.get('content-type') || '';
                if (!ct.startsWith(expectContentType)) {
                    throw new Error(`Expected content-type ${expectContentType}, got ${ct}`);
                }
            }

            return response;
        } catch (err) {
            lastError = err as Error;
            if (attempt < retries) {
                const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    throw new Error(`safeFetch failed after ${retries} attempts for ${url}: ${lastError?.message}`);
}

/**
 * Convenience: fetch and parse JSON with retry.
 */
export async function safeFetchJSON<T = unknown>(url: string, opts: SafeFetchOptions = {}): Promise<T> {
    const response = await safeFetch(url, {
        expectContentType: 'application/json',
        ...opts,
    });
    return response.json() as Promise<T>;
}

/**
 * Convenience: fetch and parse text (HTML/XML) with retry.
 */
export async function safeFetchText(url: string, opts: SafeFetchOptions = {}): Promise<string> {
    const response = await safeFetch(url, opts);
    return response.text();
}

// ── isSenior ───────────────────────────────────────────

/**
 * Returns true if the animal's age qualifies as senior for its species and size.
 * When size is known for dogs, uses breed-group-appropriate thresholds.
 * Falls back to species defaults when size is unknown.
 */
export function isSenior(
    ageYears: number | null | undefined,
    species: 'DOG' | 'CAT' | 'OTHER',
    size?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null,
): boolean {
    if (ageYears == null) return false;

    if (species === 'DOG' && size && DOG_SENIOR_BY_SIZE[size] !== undefined) {
        return ageYears >= DOG_SENIOR_BY_SIZE[size];
    }

    return ageYears >= (SENIOR_AGE[species] ?? 7);
}

// ── validateAnimal ─────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    warnings: string[];
    errors: string[];
}

/**
 * Validate a ScrapedAnimal record. Returns errors (must-have fields missing)
 * and warnings (nice-to-have fields missing).
 */
export function validateAnimal(animal: Partial<ScrapedAnimal>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!animal.intakeId) errors.push('Missing intakeId');
    if (!animal.species) errors.push('Missing species');
    if (animal.species === 'OTHER') errors.push('Unsupported species (only DOG and CAT)');
    if (!animal.photoUrl) errors.push('Missing photoUrl');

    // Reject placeholder / junk names
    const JUNK_NAMES = ['other / not listed', 'not listed', 'unknown', 'n/a', 'na', 'none', 'tbd', 'no name', 'test', 'unnamed'];
    if (animal.name && JUNK_NAMES.includes(animal.name.toLowerCase().trim())) {
        errors.push(`Placeholder name: "${animal.name}"`);
    }

    // Warnings for missing but non-critical fields
    if (!animal.name) warnings.push('Missing name');
    if (!animal.breed) warnings.push('Missing breed');
    if (animal.ageKnownYears == null) warnings.push('Missing ageKnownYears');
    if (animal.sex === 'UNKNOWN') warnings.push('Sex unknown');

    return {
        valid: errors.length === 0,
        warnings,
        errors,
    };
}

// ── Health Report ──────────────────────────────────────

export interface AdapterHealth {
    shelterId: string;
    shelterName: string;
    success: boolean;
    animalsFound: number;
    validAnimals: number;
    invalidAnimals: number;
    warnings: number;
    durationMs: number;
    error?: string;
}

/**
 * Wraps an adapter function with health tracking and error isolation.
 * If the adapter throws, returns an empty array + health report with the error.
 */
export function withHealthReport(
    shelterId: string,
    shelterName: string,
    adapterFn: () => Promise<ScrapedAnimal[]>,
): () => Promise<{ animals: ScrapedAnimal[]; health: AdapterHealth }> {
    return async () => {
        const start = Date.now();
        let animals: ScrapedAnimal[] = [];
        let validCount = 0;
        let invalidCount = 0;
        let warningCount = 0;

        try {
            animals = await adapterFn();

            // Validate each animal
            const validated: ScrapedAnimal[] = [];
            for (const animal of animals) {
                const result = validateAnimal(animal);
                if (result.valid) {
                    validated.push(animal);
                    validCount++;
                    warningCount += result.warnings.length;
                } else {
                    invalidCount++;
                }
            }

            const health: AdapterHealth = {
                shelterId,
                shelterName,
                success: true,
                animalsFound: animals.length,
                validAnimals: validCount,
                invalidAnimals: invalidCount,
                warnings: warningCount,
                durationMs: Date.now() - start,
            };

            return { animals: validated, health };
        } catch (err) {
            const health: AdapterHealth = {
                shelterId,
                shelterName,
                success: false,
                animalsFound: 0,
                validAnimals: 0,
                invalidAnimals: 0,
                warnings: 0,
                durationMs: Date.now() - start,
                error: (err as Error).message?.substring(0, 200),
            };

            console.error(`   ❌ ${shelterName}: ${health.error}`);
            return { animals: [], health };
        }
    };
}

/**
 * Log a health report summary to console.
 */
export function logHealthReport(reports: AdapterHealth[]): void {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`🏥 Adapter Health Report`);
    console.log(`═══════════════════════════════════════════`);

    let totalAnimals = 0;
    let totalValid = 0;
    let failures = 0;

    for (const r of reports) {
        const icon = r.success ? '🟢' : '🔴';
        const duration = (r.durationMs / 1000).toFixed(1);
        console.log(`   ${icon} ${r.shelterName}: ${r.validAnimals} valid / ${r.animalsFound} found (${duration}s)`);
        if (r.invalidAnimals > 0) {
            console.log(`      ⚠ ${r.invalidAnimals} invalid records dropped`);
        }
        if (r.error) {
            console.log(`      ❌ ${r.error}`);
            failures++;
        }
        totalAnimals += r.animalsFound;
        totalValid += r.validAnimals;
    }

    console.log(`\n   Total: ${totalValid} valid / ${totalAnimals} found | ${failures} failures / ${reports.length} adapters`);
}

// ── Common Mappers ─────────────────────────────────────

/** Map common sex strings to normalized values */
export function mapSex(sex: string | null | undefined): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    if (!sex) return 'UNKNOWN';
    const s = sex.toLowerCase().trim();
    if (s === 'male' || s === 'm') return 'MALE';
    if (s === 'female' || s === 'f') return 'FEMALE';
    if (s.includes('male') && !s.includes('female')) return 'MALE';
    if (s.includes('female')) return 'FEMALE';
    // PetPoint codes
    if (s === 'n') return 'MALE';   // neutered
    if (s === 's') return 'FEMALE'; // spayed
    return 'UNKNOWN';
}

/** Map common species strings to normalized values */
export function mapSpecies(species: string | null | undefined): 'DOG' | 'CAT' | 'OTHER' {
    if (!species) return 'OTHER';
    const s = species.toLowerCase().trim();
    if (s === 'dog' || s === 'canine' || s === 'k9') return 'DOG';
    if (s === 'cat' || s === 'feline') return 'CAT';
    return 'OTHER';
}

/** Map common size strings to normalized values */
export function mapSize(size: string | null | undefined): 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null {
    if (!size) return null;
    const s = size.toLowerCase().trim();
    if (s.includes('x-large') || s.includes('xlarge') || s.includes('extra large')) return 'XLARGE';
    if (s.includes('large')) return 'LARGE';
    if (s.includes('medium') || s.includes('med')) return 'MEDIUM';
    if (s.includes('small') || s.includes('toy') || s.includes('mini')) return 'SMALL';
    return null;
}

/** Parse age from common string formats like "10 years", "8 Years 3 Months", "Senior" */
export function parseAge(ageString: string | null | undefined): number | null {
    if (!ageString) return null;
    const yearMatch = ageString.match(/(\d+)\s*year/i);
    if (yearMatch) return parseInt(yearMatch[1], 10);
    const monthMatch = ageString.match(/(\d+)\s*month/i);
    if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        return Math.floor(months / 12);
    }
    return null;
}

// ── Photo Validation ──────────────────────────────────

/**
 * Validate that a photo URL actually resolves to an image.
 * Uses HEAD request with a short timeout to avoid blocking the pipeline.
 * Returns true if the URL responds with 2xx and an image content-type.
 */
export async function validatePhotoUrl(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5_000),
            headers: { 'User-Agent': USER_AGENT },
        });
        const ct = response.headers.get('content-type') || '';
        return response.ok && ct.startsWith('image/');
    } catch {
        return false;
    }
}
