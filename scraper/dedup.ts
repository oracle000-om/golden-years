/**
 * Golden Years Club — 3-Tier Duplicate Detection
 *
 * Detects duplicate animals across scraper sources using three tiers:
 *
 *   Tier 1: Exact match   → same shelterId + intakeId (same animal, different scrape run)
 *   Tier 2: Cross-source  → same photoUrl across different shelters (same photo = same animal)
 *   Tier 3: Perceptual hash → aHash of photo, hamming distance ≤ 5 (visually identical photos)
 *
 * We NEVER auto-merge below Tier 3. No fuzzy attribute matching.
 */

import sharp from 'sharp';

// ── Types ──

export interface DedupMatch {
    /** The existing animal record ID */
    animalId: string;
    /** Which tier matched */
    tier: 1 | 2 | 3;
    /** Human-readable description */
    reason: string;
}

// ── Perceptual Hash ──

/**
 * Compute a perceptual hash (average hash / aHash) for an image URL.
 *
 * Algorithm:
 *   1. Fetch the image
 *   2. Resize to 8×8 grayscale (64 pixels)
 *   3. Compute the mean pixel value
 *   4. Encode each pixel as 1 (above mean) or 0 (below mean)
 *   5. Pack into a 16-character hex string (64 bits)
 *
 * Returns null if the image can't be fetched or processed.
 */
export async function computePhotoHash(photoUrl: string): Promise<string | null> {
    try {
        // Fetch image
        const response = await fetch(photoUrl, {
            signal: AbortSignal.timeout(10_000),
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (dedup)' },
        });
        if (!response.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());

        // Resize to 8×8 grayscale and get raw pixel data
        const pixels = await sharp(buffer)
            .resize(8, 8, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

        if (pixels.length !== 64) return null;

        // Compute mean
        let sum = 0;
        for (let i = 0; i < 64; i++) {
            sum += pixels[i];
        }
        const mean = sum / 64;

        // Build 64-bit hash: each pixel → 1 if >= mean, 0 otherwise
        let hashBits = '';
        for (let i = 0; i < 64; i++) {
            hashBits += pixels[i] >= mean ? '1' : '0';
        }

        // Convert to 16-char hex string
        let hex = '';
        for (let i = 0; i < 64; i += 4) {
            hex += parseInt(hashBits.substring(i, i + 4), 2).toString(16);
        }

        return hex;
    } catch {
        return null;
    }
}

/**
 * Compute the Hamming distance between two hex hash strings.
 * The Hamming distance is the number of differing bits.
 *
 * Returns Infinity if the hashes are different lengths.
 */
export function hammingDistance(a: string, b: string): number {
    if (a.length !== b.length) return Infinity;

    let distance = 0;
    for (let i = 0; i < a.length; i++) {
        const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        // Count bits set in XOR result (each hex digit is 4 bits)
        distance += popcount4(xor);
    }
    return distance;
}

/** Count set bits in a 4-bit value */
function popcount4(n: number): number {
    let count = 0;
    while (n) {
        count += n & 1;
        n >>= 1;
    }
    return count;
}

// ── Dedup Logic ──

const PHASH_THRESHOLD = 5; // Max hamming distance for pHash match

/**
 * Find an existing animal that is a duplicate of the given scraped animal.
 *
 * Checks three tiers in order and short-circuits on the first match:
 *   1. Exact: same shelterId + intakeId
 *   2. Cross-source: same photoUrl on any record
 *   3. Perceptual hash: aHash within hamming distance ≤ 5
 *
 * @param prisma  - Prisma client instance
 * @param intakeId - The animal's shelter intake ID
 * @param shelterId - The shelter this animal belongs to
 * @param photoUrl - The animal's photo URL (nullable)
 * @param photoHash - Pre-computed photo hash (nullable, computed if not provided)
 * @returns DedupMatch if a duplicate is found, null otherwise
 */
export async function findDuplicate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any,
    intakeId: string,
    shelterId: string,
    photoUrl: string | null,
    photoHash: string | null,
): Promise<DedupMatch | null> {
    // ── Tier 1: Exact match (same shelter + intake ID) ──
    if (intakeId) {
        const exact = await prisma.animal.findFirst({
            where: { shelterId, intakeId },
            select: { id: true },
        });
        if (exact) {
            return {
                animalId: exact.id,
                tier: 1,
                reason: `Exact match: shelterId=${shelterId}, intakeId=${intakeId}`,
            };
        }
    }

    // ── Tier 2: Cross-source exact (same photo URL, any shelter) ──
    if (photoUrl) {
        const crossSource = await prisma.animal.findFirst({
            where: { photoUrl },
            select: { id: true, shelterId: true },
        });
        if (crossSource) {
            return {
                animalId: crossSource.id,
                tier: 2,
                reason: `Cross-source photo URL match (existing shelter: ${crossSource.shelterId})`,
            };
        }
    }

    // ── Tier 3: Perceptual hash match ──
    if (photoHash) {
        // Query animals that have a photo hash (index-backed)
        const candidates = await prisma.animal.findMany({
            where: { photoHash: { not: null } },
            select: { id: true, photoHash: true, shelterId: true, intakeId: true },
        });

        for (const candidate of candidates) {
            if (!candidate.photoHash) continue;
            const dist = hammingDistance(photoHash, candidate.photoHash);
            if (dist <= PHASH_THRESHOLD) {
                return {
                    animalId: candidate.id,
                    tier: 3,
                    reason: `Perceptual hash match (hamming distance: ${dist}, threshold: ${PHASH_THRESHOLD})`,
                };
            }
        }
    }

    return null;
}
