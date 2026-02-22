/**
 * Dedup — Cross-source duplicate detection for animals
 *
 * Tiered matching strategy:
 *   T1: Exact intakeId + same shelter (100% — same animal, different scrape run)
 *   T2: Same photo URL across any source (95%+ — same listing image)
 *   T3: Perceptual hash match, hamming distance ≤ 5 (90% — visually identical photos)
 *
 * Higher tiers (attribute-based fuzzy matching) are NOT auto-linked;
 * they should only flag for human review.
 */

import sharp from 'sharp';

// ── Types ──

export interface DedupMatch {
    animalId: string;
    tier: number;        // 1 = exact, 2 = cross-source URL, 3 = pHash
    reason: string;
    confidence: number;  // 0–1
}

// ── Perceptual Hashing ──

/**
 * Compute a perceptual hash (pHash) for an image URL.
 *
 * Algorithm:
 *   1. Download and decode image
 *   2. Resize to 8×8 grayscale (64 pixels)
 *   3. Compute mean luminance
 *   4. Each pixel → 1 if above mean, 0 if below
 *   5. Pack into 16-char hex string (64 bits)
 */
export async function computePhotoHash(photoUrl: string): Promise<string> {
    const response = await fetch(photoUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    // Resize to 8×8 grayscale
    const pixels = await sharp(buffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

    // Compute mean
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += pixels[i];
    const mean = sum / 64;

    // Build binary hash: 1 if pixel >= mean, 0 if below
    let hashBits = '';
    for (let i = 0; i < 64; i++) {
        hashBits += pixels[i] >= mean ? '1' : '0';
    }

    // Convert to hex (64 bits → 16 hex chars)
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
        hex += parseInt(hashBits.substring(i, i + 4), 2).toString(16);
    }

    return hex;
}

/**
 * Compute hamming distance between two hex hash strings.
 * Returns number of differing bits (0 = identical, 64 = completely different).
 */
function hammingDistance(hashA: string, hashB: string): number {
    if (hashA.length !== hashB.length) return 64; // incomparable

    let distance = 0;
    for (let i = 0; i < hashA.length; i++) {
        const a = parseInt(hashA[i], 16);
        const b = parseInt(hashB[i], 16);
        // Count differing bits in this nibble
        let xor = a ^ b;
        while (xor > 0) {
            distance += xor & 1;
            xor >>= 1;
        }
    }
    return distance;
}

// ── Duplicate Finder ──

const PHASH_THRESHOLD = 5; // max hamming distance for pHash match

/**
 * Find a duplicate animal in the database using tiered matching.
 *
 * Returns the best match (lowest tier = highest confidence), or null.
 *
 * @param prisma  - Prisma client instance
 * @param intakeId - The intake ID from the source
 * @param shelterId - The shelter this animal belongs to
 * @param photoUrl - The photo URL (for cross-source URL matching)
 * @param photoHash - Pre-computed pHash (for perceptual matching)
 */
export async function findDuplicate(
    prisma: any,
    intakeId: string | null | undefined,
    shelterId: string,
    photoUrl: string | null | undefined,
    photoHash: string | null,
): Promise<DedupMatch | null> {

    // ── Tier 1: Exact intakeId + same shelter ──
    if (intakeId) {
        const exact = await prisma.animal.findFirst({
            where: { shelterId, intakeId },
            select: { id: true },
        });
        if (exact) {
            return {
                animalId: exact.id,
                tier: 1,
                reason: `Exact match: ${intakeId} @ ${shelterId}`,
                confidence: 1.0,
            };
        }
    }

    // ── Tier 2: Same photo URL across any source ──
    if (photoUrl) {
        const urlMatch = await prisma.animal.findFirst({
            where: {
                photoUrl,
                NOT: { shelterId },  // only interesting if it's a DIFFERENT shelter
            },
            select: { id: true, shelterId: true, name: true },
        });
        if (urlMatch) {
            return {
                animalId: urlMatch.id,
                tier: 2,
                reason: `Same photo URL found at shelter ${urlMatch.shelterId} (${urlMatch.name})`,
                confidence: 0.95,
            };
        }
    }

    // ── Tier 3: Perceptual hash match ──
    if (photoHash) {
        // Query animals with non-null photoHash from OTHER shelters
        const candidates = await prisma.animal.findMany({
            where: {
                photoHash: { not: null },
                NOT: { shelterId },
            },
            select: { id: true, photoHash: true, shelterId: true, name: true },
            take: 500,  // reasonable limit per query
        });

        let bestMatch: DedupMatch | null = null;
        let bestDistance = PHASH_THRESHOLD + 1;

        for (const candidate of candidates) {
            if (!candidate.photoHash) continue;
            const dist = hammingDistance(photoHash, candidate.photoHash);
            if (dist <= PHASH_THRESHOLD && dist < bestDistance) {
                bestDistance = dist;
                bestMatch = {
                    animalId: candidate.id,
                    tier: 3,
                    reason: `pHash match (distance=${dist}) with ${candidate.name} at ${candidate.shelterId}`,
                    confidence: Math.max(0.7, 1 - (dist / 64)),
                };
            }
        }

        if (bestMatch) return bestMatch;
    }

    return null;
}
