/**
 * Breed Profile Enrichment
 *
 * Links CV-detected breeds to BreedProfile table for richer data:
 *   - commonConditions (feeds into computeHealthScore context)
 *   - healthRiskScore
 *   - seniorAgeThreshold
 *   - careNotes
 *
 * Uses fuzzy matching: "Golden Retriever Mix" → matches "Golden Retriever".
 */

import type { PrismaClient } from '../../src/generated/prisma/client';

export interface BreedEnrichment {
    /** Matched breed profile name */
    matchedBreed: string;
    /** Common health conditions for this breed */
    commonConditions: string[];
    /** Health risk score (1-10, higher = more risk) */
    healthRiskScore: number | null;
    /** Age at which this breed is considered senior */
    seniorAgeThreshold: number | null;
    /** Breed-specific care notes */
    careNotes: string | null;
}

/**
 * Look up breed profiles for CV-detected breeds.
 *
 * @param detectedBreeds - Array of detected breed strings from CV
 * @param species - DOG, CAT, or OTHER
 * @param prisma - Prisma client instance
 * @returns Array of enrichment data for matched breeds
 */
export async function enrichWithBreedProfile(
    detectedBreeds: string[],
    species: string,
    prisma: PrismaClient,
): Promise<BreedEnrichment[]> {
    if (!detectedBreeds.length || species === 'OTHER') return [];

    const results: BreedEnrichment[] = [];

    // Load all breed profiles for the species (cached per species)
    const profiles = await (prisma as any).breedProfile.findMany({
        where: { species },
        select: {
            name: true,
            commonConditions: true,
            healthRiskScore: true,
            seniorAgeThreshold: true,
            careNotes: true,
        },
    });

    if (profiles.length === 0) return [];

    for (const breed of detectedBreeds) {
        const normalizedBreed = breed.toLowerCase().trim();

        // Try exact match first
        let match = profiles.find(
            (p: any) => p.name.toLowerCase() === normalizedBreed,
        );

        // Fuzzy: check if the detected breed CONTAINS a profile name
        // e.g. "Golden Retriever Mix" → matches "Golden Retriever"
        if (!match) {
            match = profiles.find(
                (p: any) => normalizedBreed.includes(p.name.toLowerCase()),
            );
        }

        // Fuzzy: check if a profile name CONTAINS the detected breed
        // e.g. "Retriever" → matches "Golden Retriever"
        if (!match) {
            match = profiles.find(
                (p: any) => p.name.toLowerCase().includes(normalizedBreed),
            );
        }

        if (match) {
            results.push({
                matchedBreed: match.name,
                commonConditions: match.commonConditions || [],
                healthRiskScore: match.healthRiskScore,
                seniorAgeThreshold: match.seniorAgeThreshold,
                careNotes: match.careNotes,
            });
        }
    }

    return results;
}
