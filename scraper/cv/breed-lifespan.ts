/**
 * Breed Life Expectancy Database
 *
 * Static lookup table of common dog and cat breeds mapped to
 * typical life expectancy ranges. Data sourced from AKC breed
 * standards and veterinary references.
 *
 * Includes fuzzy matching for mixes and partial breed strings.
 */

export interface LifeExpectancy {
    low: number;   // years
    high: number;  // years
}

/** Dog breeds — alphabetical, ~80 common breeds */
const DOG_BREEDS: Record<string, LifeExpectancy> = {
    'akita': { low: 10, high: 13 },
    'alaskan malamute': { low: 10, high: 14 },
    'american bulldog': { low: 10, high: 12 },
    'american pit bull terrier': { low: 12, high: 16 },
    'american staffordshire terrier': { low: 12, high: 16 },
    'australian cattle dog': { low: 12, high: 16 },
    'australian shepherd': { low: 12, high: 15 },
    'basset hound': { low: 12, high: 13 },
    'beagle': { low: 10, high: 15 },
    'bernese mountain dog': { low: 6, high: 8 },
    'bichon frise': { low: 14, high: 15 },
    'bloodhound': { low: 10, high: 12 },
    'border collie': { low: 12, high: 15 },
    'boston terrier': { low: 11, high: 13 },
    'boxer': { low: 10, high: 12 },
    'brittany': { low: 12, high: 14 },
    'brussels griffon': { low: 12, high: 15 },
    'bull terrier': { low: 12, high: 13 },
    'bulldog': { low: 8, high: 10 },
    'bullmastiff': { low: 7, high: 9 },
    'cairn terrier': { low: 13, high: 15 },
    'cane corso': { low: 9, high: 12 },
    'cavalier king charles spaniel': { low: 12, high: 15 },
    'chesapeake bay retriever': { low: 10, high: 13 },
    'chihuahua': { low: 14, high: 16 },
    'chinese crested': { low: 13, high: 18 },
    'chow chow': { low: 8, high: 12 },
    'cocker spaniel': { low: 10, high: 14 },
    'collie': { low: 12, high: 14 },
    'corgi': { low: 12, high: 15 },
    'dachshund': { low: 12, high: 16 },
    'dalmatian': { low: 11, high: 13 },
    'doberman': { low: 10, high: 12 },
    'doberman pinscher': { low: 10, high: 12 },
    'english bulldog': { low: 8, high: 10 },
    'english setter': { low: 12, high: 14 },
    'english springer spaniel': { low: 12, high: 14 },
    'french bulldog': { low: 10, high: 12 },
    'german shepherd': { low: 7, high: 10 },
    'german shorthaired pointer': { low: 12, high: 14 },
    'golden retriever': { low: 10, high: 12 },
    'great dane': { low: 7, high: 10 },
    'great pyrenees': { low: 10, high: 12 },
    'greyhound': { low: 10, high: 13 },
    'havanese': { low: 14, high: 16 },
    'husky': { low: 12, high: 14 },
    'irish setter': { low: 12, high: 15 },
    'irish wolfhound': { low: 6, high: 8 },
    'jack russell terrier': { low: 12, high: 14 },
    'japanese chin': { low: 10, high: 12 },
    'labrador retriever': { low: 10, high: 14 },
    'lhasa apso': { low: 12, high: 14 },
    'maltese': { low: 12, high: 15 },
    'mastiff': { low: 6, high: 10 },
    'miniature pinscher': { low: 12, high: 16 },
    'miniature schnauzer': { low: 12, high: 15 },
    'newfoundland': { low: 9, high: 10 },
    'old english sheepdog': { low: 10, high: 12 },
    'papillon': { low: 14, high: 16 },
    'pekingese': { low: 12, high: 14 },
    'pembroke welsh corgi': { low: 12, high: 15 },
    'pit bull': { low: 12, high: 16 },
    'pit bull terrier': { low: 12, high: 16 },
    'plott hound': { low: 12, high: 14 },
    'pointer': { low: 12, high: 17 },
    'pomeranian': { low: 12, high: 16 },
    'poodle': { low: 10, high: 18 },
    'pug': { low: 13, high: 15 },
    'rat terrier': { low: 12, high: 18 },
    'rhodesian ridgeback': { low: 10, high: 12 },
    'rottweiler': { low: 9, high: 10 },
    'saint bernard': { low: 8, high: 10 },
    'samoyed': { low: 12, high: 14 },
    'schnauzer': { low: 12, high: 15 },
    'scottish terrier': { low: 12, high: 14 },
    'shar pei': { low: 8, high: 12 },
    'shiba inu': { low: 13, high: 16 },
    'shih tzu': { low: 10, high: 18 },
    'siberian husky': { low: 12, high: 14 },
    'staffordshire bull terrier': { low: 12, high: 14 },
    'standard poodle': { low: 10, high: 13 },
    'terrier': { low: 12, high: 15 },
    'vizsla': { low: 12, high: 14 },
    'weimaraner': { low: 10, high: 13 },
    'west highland terrier': { low: 13, high: 15 },
    'westie': { low: 13, high: 15 },
    'whippet': { low: 12, high: 15 },
    'yorkshire terrier': { low: 11, high: 15 },
    'yorkie': { low: 11, high: 15 },
};

/** Cat breeds — common breeds + shelter catch-all categories */
const CAT_BREEDS: Record<string, LifeExpectancy> = {
    'abyssinian': { low: 9, high: 15 },
    'bengal': { low: 12, high: 16 },
    'birman': { low: 12, high: 16 },
    'british shorthair': { low: 12, high: 17 },
    'burmese': { low: 16, high: 18 },
    'domestic longhair': { low: 12, high: 18 },
    'domestic medium hair': { low: 12, high: 18 },
    'domestic shorthair': { low: 12, high: 18 },
    'himalayan': { low: 9, high: 15 },
    'maine coon': { low: 10, high: 13 },
    'manx': { low: 8, high: 14 },
    'persian': { low: 12, high: 17 },
    'ragdoll': { low: 12, high: 15 },
    'russian blue': { low: 15, high: 20 },
    'scottish fold': { low: 11, high: 14 },
    'siamese': { low: 12, high: 20 },
    'sphynx': { low: 8, high: 14 },
    'tabby': { low: 12, high: 18 },
    'tuxedo': { low: 12, high: 18 },
    'calico': { low: 12, high: 18 },
    'tortoiseshell': { low: 12, high: 18 },
};

/** Generic fallbacks when no breed match is found */
const GENERIC_DOG: LifeExpectancy = { low: 10, high: 13 };
const GENERIC_CAT: LifeExpectancy = { low: 12, high: 18 };

/** Size-specific fallbacks for dogs (cats vary less by size) */
const DOG_SIZE_FALLBACKS: Record<string, LifeExpectancy> = {
    SMALL: { low: 12, high: 16 },
    MEDIUM: { low: 10, high: 14 },
    LARGE: { low: 8, high: 12 },
    XLARGE: { low: 7, high: 10 },
};

/** Expected size category for known breeds (dogs only — cats are ~uniform) */
const BREED_EXPECTED_SIZE: Record<string, 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE'> = {
    // XLARGE breeds
    'great dane': 'XLARGE', 'mastiff': 'XLARGE', 'saint bernard': 'XLARGE',
    'irish wolfhound': 'XLARGE', 'newfoundland': 'XLARGE', 'great pyrenees': 'XLARGE',
    'cane corso': 'XLARGE', 'bullmastiff': 'XLARGE',
    // LARGE breeds
    'german shepherd': 'LARGE', 'golden retriever': 'LARGE', 'labrador retriever': 'LARGE',
    'rottweiler': 'LARGE', 'doberman': 'LARGE', 'doberman pinscher': 'LARGE',
    'bernese mountain dog': 'LARGE', 'rhodesian ridgeback': 'LARGE', 'weimaraner': 'LARGE',
    'akita': 'LARGE', 'alaskan malamute': 'LARGE', 'bloodhound': 'LARGE',
    'chesapeake bay retriever': 'LARGE', 'collie': 'LARGE', 'old english sheepdog': 'LARGE',
    'siberian husky': 'LARGE', 'husky': 'LARGE', 'boxer': 'LARGE',
    'american bulldog': 'LARGE', 'chow chow': 'LARGE', 'dalmatian': 'LARGE',
    'greyhound': 'LARGE', 'irish setter': 'LARGE', 'samoyed': 'LARGE',
    'standard poodle': 'LARGE', 'vizsla': 'LARGE',
    'german shorthaired pointer': 'LARGE', 'english setter': 'LARGE',
    'english springer spaniel': 'LARGE',
    // MEDIUM breeds
    'australian shepherd': 'MEDIUM', 'australian cattle dog': 'MEDIUM', 'border collie': 'MEDIUM',
    'bulldog': 'MEDIUM', 'english bulldog': 'MEDIUM', 'basset hound': 'MEDIUM',
    'beagle': 'MEDIUM', 'brittany': 'MEDIUM', 'cocker spaniel': 'MEDIUM',
    'corgi': 'MEDIUM', 'pembroke welsh corgi': 'MEDIUM', 'shar pei': 'MEDIUM',
    'staffordshire bull terrier': 'MEDIUM', 'whippet': 'MEDIUM',
    'american pit bull terrier': 'MEDIUM', 'american staffordshire terrier': 'MEDIUM',
    'pit bull': 'MEDIUM', 'pit bull terrier': 'MEDIUM', 'bull terrier': 'MEDIUM',
    'plott hound': 'MEDIUM', 'french bulldog': 'MEDIUM',
    // SMALL breeds
    'chihuahua': 'SMALL', 'dachshund': 'SMALL', 'yorkshire terrier': 'SMALL', 'yorkie': 'SMALL',
    'maltese': 'SMALL', 'pomeranian': 'SMALL', 'shih tzu': 'SMALL', 'pug': 'SMALL',
    'boston terrier': 'SMALL', 'bichon frise': 'SMALL', 'havanese': 'SMALL',
    'cavalier king charles spaniel': 'SMALL', 'papillon': 'SMALL', 'pekingese': 'SMALL',
    'miniature pinscher': 'SMALL', 'miniature schnauzer': 'SMALL', 'lhasa apso': 'SMALL',
    'cairn terrier': 'SMALL', 'jack russell terrier': 'SMALL', 'rat terrier': 'SMALL',
    'scottish terrier': 'SMALL', 'west highland terrier': 'SMALL', 'westie': 'SMALL',
    'brussels griffon': 'SMALL', 'chinese crested': 'SMALL', 'japanese chin': 'SMALL',
    'shiba inu': 'SMALL',
};

/** Size rank for comparing expected vs actual */
const SIZE_RANK: Record<string, number> = { SMALL: 0, MEDIUM: 1, LARGE: 2, XLARGE: 3 };

/** Mix uncertainty — add this many years to the range for mixed breeds */
const MIX_BUFFER = 1;

/**
 * Normalize a breed string for lookup.
 */
function normalize(breed: string): string {
    return breed
        .toLowerCase()
        .replace(/[-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Try to find a breed match in the lookup table.
 * Returns the match or null.
 */
function findBreedMatch(breed: string, table: Record<string, LifeExpectancy>): LifeExpectancy | null {
    const normalized = normalize(breed);

    // Exact match
    if (table[normalized]) return table[normalized];

    // Check if the normalized breed contains any key (e.g., "golden retriever mix" contains "golden retriever")
    for (const [key, value] of Object.entries(table)) {
        if (normalized.includes(key)) return value;
    }

    // Check if any key contains the normalized breed (e.g., key "labrador retriever" for input "labrador")
    for (const [key, value] of Object.entries(table)) {
        if (key.includes(normalized) && normalized.length >= 3) return value;
    }

    return null;
}

/**
 * Find the expected size for a breed string.
 */
function findExpectedSize(breed: string): 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null {
    const normalized = normalize(breed);
    if (BREED_EXPECTED_SIZE[normalized]) return BREED_EXPECTED_SIZE[normalized];

    for (const [key, size] of Object.entries(BREED_EXPECTED_SIZE)) {
        if (normalized.includes(key)) return size;
    }
    for (const [key, size] of Object.entries(BREED_EXPECTED_SIZE)) {
        if (key.includes(normalized) && normalized.length >= 3) return size;
    }
    return null;
}

export type AnimalSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null;

/**
 * Look up life expectancy for detected breeds, factoring in shelter-reported size.
 *
 * Strategy:
 *   1. Try each detected breed against the lookup table
 *   2. If multiple breeds match (mix), average their ranges
 *   3. If it's a mix, widen the range by MIX_BUFFER
 *   4. Check for breed-size conflict: if shelter size disagrees with breed's
 *      expected size by 2+ categories, blend the breed range with the
 *      size-based fallback to account for possible misidentification
 *   5. If no breed matched, use size-specific fallback (dogs) or generic
 *
 * @param detectedBreeds - Array of CV-detected breed strings
 * @param species - DOG, CAT, or OTHER
 * @param shelterSize - Size reported by the data source (SMALL/MEDIUM/LARGE/XLARGE)
 * @returns Life expectancy range, or null for OTHER species
 */
export function lookupLifeExpectancy(
    detectedBreeds: string[],
    species: 'DOG' | 'CAT' | 'OTHER',
    shelterSize: AnimalSize = null,
): LifeExpectancy | null {
    if (species === 'OTHER') return null;

    const table = species === 'DOG' ? DOG_BREEDS : CAT_BREEDS;

    // Size-aware fallback for dogs, generic for cats
    const fallback = species === 'DOG' && shelterSize && DOG_SIZE_FALLBACKS[shelterSize]
        ? DOG_SIZE_FALLBACKS[shelterSize]
        : (species === 'DOG' ? GENERIC_DOG : GENERIC_CAT);

    if (detectedBreeds.length === 0) return fallback;

    const matches: LifeExpectancy[] = [];
    const isMix = detectedBreeds.length > 1 ||
        detectedBreeds.some(b => normalize(b).includes('mix'));

    for (const breed of detectedBreeds) {
        const match = findBreedMatch(breed, table);
        if (match) matches.push(match);
    }

    if (matches.length === 0) return fallback;

    // Average the matched ranges
    let avgLow = Math.round(matches.reduce((sum, m) => sum + m.low, 0) / matches.length);
    let avgHigh = Math.round(matches.reduce((sum, m) => sum + m.high, 0) / matches.length);

    // Widen range for mixes
    if (isMix) {
        avgLow = Math.max(avgLow - MIX_BUFFER, 5);
        avgHigh = avgHigh + MIX_BUFFER;
    }

    // Breed-size conflict detection (dogs only — cats don't vary much by size)
    if (species === 'DOG' && shelterSize) {
        const expectedSizes = detectedBreeds
            .map(b => findExpectedSize(b))
            .filter((s): s is NonNullable<typeof s> => s !== null);

        if (expectedSizes.length > 0) {
            // Use the first detected breed's expected size as primary
            const expectedSize = expectedSizes[0];
            const shelterRank = SIZE_RANK[shelterSize] ?? 1;
            const expectedRank = SIZE_RANK[expectedSize] ?? 1;
            const sizeDiff = Math.abs(shelterRank - expectedRank);

            // If shelter size disagrees by 2+ categories (e.g., mastiff listed as SMALL),
            // blend the breed-based range with the size-based fallback.
            // This handles cases like "looks like a mastiff but listed as medium."
            if (sizeDiff >= 2) {
                const sizeFallback = DOG_SIZE_FALLBACKS[shelterSize] || GENERIC_DOG;
                // 60% breed-based, 40% size-based — breed ID still has more weight
                // but the size discrepancy meaningfully adjusts the estimate
                avgLow = Math.round(avgLow * 0.6 + sizeFallback.low * 0.4);
                avgHigh = Math.round(avgHigh * 0.6 + sizeFallback.high * 0.4);
            }
        }
    }

    return { low: avgLow, high: avgHigh };
}

