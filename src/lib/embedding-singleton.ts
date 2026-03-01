/**
 * Embedding Singleton — Pre-Warmed Python Worker for API Use
 *
 * Wraps the existing Python EmbeddingProvider (ResNet50 + Milvus/Zilliz)
 * as a lazy singleton for the Next.js API endpoints. Exposes both
 * embedding generation and similarity search.
 *
 * The worker connects to Zilliz Cloud when ZILLIZ_ENDPOINT is set,
 * otherwise falls back to local Milvus Lite for dev.
 */

import { createEmbeddingProvider, type EmbeddingProvider, type SearchMatch } from '../../scraper/cv';

let _provider: EmbeddingProvider | null = null;
let _initializing: Promise<EmbeddingProvider | null> | null = null;

/**
 * Get (or lazily create) the singleton embedding provider.
 * Returns null if Python/torch is unavailable.
 */
async function getProvider(): Promise<EmbeddingProvider | null> {
    if (_provider?.ready) return _provider;

    // Prevent thundering herd — only one init at a time
    if (_initializing) return _initializing;

    _initializing = createEmbeddingProvider().then(p => {
        _provider = p;
        _initializing = null;
        return p;
    }).catch(err => {
        console.error('[embedding-singleton] Init failed:', (err as Error).message);
        _initializing = null;
        return null;
    });

    return _initializing;
}

/**
 * Generate a 2048-d L2-normalized embedding from a photo URL.
 * Returns null if the provider is unavailable or embedding fails.
 */
export async function getEmbedding(photoUrl: string): Promise<number[] | null> {
    const provider = await getProvider();
    if (!provider) return null;

    try {
        const embedding = await provider.generateEmbedding(photoUrl, `api-${Date.now()}`);
        if (embedding && embedding.length === 2048) {
            return embedding;
        }
        return null;
    } catch (err) {
        console.error('[embedding-singleton] Generation failed:', (err as Error).message);
        return null;
    }
}

/**
 * Generate a 2048-d embedding from raw image bytes (base64-encoded).
 * Used when clients upload files directly instead of providing URLs.
 */
export async function getEmbeddingFromBytes(imageBase64: string): Promise<number[] | null> {
    const provider = await getProvider();
    if (!provider) return null;

    try {
        const embedding = await provider.generateEmbeddingFromBytes(imageBase64, `api-${Date.now()}`);
        if (embedding && embedding.length === 2048) {
            return embedding;
        }
        return null;
    } catch (err) {
        console.error('[embedding-singleton] Generation from bytes failed:', (err as Error).message);
        return null;
    }
}

/**
 * Search for animals visually similar to the given embedding.
 * Delegates to the Python worker's Milvus/Zilliz search.
 */
export async function searchSimilar(
    embedding: number[],
    opts: { species?: string; limit?: number; threshold?: number } = {},
): Promise<SearchMatch[]> {
    const provider = await getProvider();
    if (!provider) return [];

    try {
        return await provider.search(embedding, {
            species: opts.species,
            limit: opts.limit ?? 10,
            threshold: opts.threshold ?? 0.70,
        });
    } catch (err) {
        console.error('[embedding-singleton] Search failed:', (err as Error).message);
        return [];
    }
}

/**
 * Generate embedding and insert into Milvus/Zilliz in one call.
 */
export async function embedAndInsert(
    id: string,
    photoUrl: string,
    metadata?: { species?: string; shelterId?: string; ageSegment?: string },
): Promise<boolean> {
    const provider = await getProvider();
    if (!provider) return false;

    try {
        return await provider.embedAndInsert(id, photoUrl, metadata);
    } catch (err) {
        console.error('[embedding-singleton] Embed+insert failed:', (err as Error).message);
        return false;
    }
}

/**
 * Check if the embedding provider is ready.
 */
export function isReady(): boolean {
    return _provider?.ready ?? false;
}

// Re-export the SearchMatch type for consumers
export type { SearchMatch };

// Graceful shutdown on process termination
function shutdown() {
    if (_provider) {
        _provider.shutdown().catch(() => { });
        _provider = null;
    }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
