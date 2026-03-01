/**
 * Embedding Integration Helper for Runner Scripts
 *
 * Shared utility that handles embedding generation + Milvus/Zilliz storage.
 * After each successful embedding, optionally runs re-entry detection
 * to flag animals that may have re-entered the shelter system.
 *
 * Usage in runners:
 *   const embedHelper = await createEmbeddingHelper(prisma, { enableReEntryDetection: true });
 *   // In processAnimal():
 *   await embedHelper.embedAnimal(animalId, photoUrl, { species, shelterId, ageSegment });
 *   // At end:
 *   await embedHelper.shutdown();
 *   console.log(embedHelper.stats());
 */

import { createEmbeddingProvider, type EmbeddingProvider } from '../cv';
import { checkForReEntry } from '../re-entry-detector';

export interface EmbeddingHelper {
    embedAnimal(animalId: string, photoUrl: string | null, metadata?: {
        species?: string;
        shelterId?: string;
        ageSegment?: string;
        existingPhotoUrl?: string | null;
    }): Promise<void>;
    shutdown(): Promise<void>;
    stats(): { generated: number; skipped: number; failed: number; reEntryCandidates: number };
}

export async function createEmbeddingHelper(
    prisma?: any,
    opts: { enableReEntryDetection?: boolean } = {},
): Promise<EmbeddingHelper> {
    const provider = await createEmbeddingProvider();
    const reEntryEnabled = opts.enableReEntryDetection !== false && !!prisma;

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let reEntryCandidates = 0;

    return {
        async embedAnimal(
            animalId: string,
            photoUrl: string | null,
            metadata?: {
                species?: string;
                shelterId?: string;
                ageSegment?: string;
                existingPhotoUrl?: string | null;
            },
        ): Promise<void> {
            if (!provider || !photoUrl) {
                skipped++;
                return;
            }

            try {
                const ok = await provider.embedAndInsert(animalId, photoUrl, {
                    species: metadata?.species,
                    shelterId: metadata?.shelterId,
                    ageSegment: metadata?.ageSegment,
                });
                if (ok) {
                    generated++;

                    // Run re-entry detection after successful embedding
                    if (reEntryEnabled) {
                        try {
                            const embedding = await provider.generateEmbedding(photoUrl, `reentry-${animalId}`);
                            if (embedding && embedding.length === 2048) {
                                const result = await checkForReEntry(animalId, embedding, prisma, provider);
                                reEntryCandidates += result.created;
                            }
                        } catch {
                            // Non-fatal — don't block the pipeline
                        }
                    }
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        },

        async shutdown(): Promise<void> {
            if (provider) await provider.shutdown();
        },

        stats() {
            return { generated, skipped, failed, reEntryCandidates };
        },
    };
}
