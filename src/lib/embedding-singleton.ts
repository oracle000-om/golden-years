/**
 * Embedding Singleton — ONNX Node + Zilliz Search
 *
 * Embedding generation: onnxruntime-node (ResNet50 ONNX, ~70MB on Linux)
 * Vector search: @zilliz/milvus2-sdk-node (direct Zilliz Cloud API)
 *
 * Falls back to Python subprocess if ONNX model is unavailable.
 */

import { searchSimilarAnimals, type SearchMatch } from './zilliz-search';

// Re-export for consumers
export type { SearchMatch };

// Lazy singleton for the ONNX provider
let _provider: any = null;
let _initializing: Promise<any> | null = null;

async function getProvider(): Promise<any> {
    if (_provider?.ready) return _provider;
    if (_initializing) return _initializing;

    _initializing = (async () => {
        // Try ONNX provider first (works on Vercel — no Python)
        try {
            const { createOnnxEmbeddingProvider } = await import('../../scraper/cv/onnx-provider');
            const p = await createOnnxEmbeddingProvider();
            if (p) { _provider = p; return p; }
        } catch (err) {
            console.warn('[embedding-singleton] ONNX provider unavailable:', (err as Error).message);
        }

        // Fallback: Python subprocess (local dev / GitHub Actions)
        try {
            const { createEmbeddingProvider } = await import('../../scraper/cv');
            const p = await createEmbeddingProvider();
            if (p) { _provider = p; return p; }
        } catch {
            // Python not available — expected on Vercel
        }

        console.warn('[embedding-singleton] No embedding provider available');
        return null;
    })();

    _initializing.then(() => { _initializing = null; });
    return _initializing;
}

export async function getEmbedding(photoUrl: string): Promise<number[] | null> {
    const provider = await getProvider();
    if (!provider) return null;
    try {
        const embedding = await provider.generateEmbedding(photoUrl, `api-${Date.now()}`);
        return (embedding && embedding.length === 2048) ? embedding : null;
    } catch (err) {
        console.error('[embedding-singleton] Generation failed:', (err as Error).message);
        return null;
    }
}

export async function getEmbeddingFromBytes(imageBase64: string): Promise<number[] | null> {
    const provider = await getProvider();
    if (!provider) return null;
    try {
        const embedding = await provider.generateEmbeddingFromBytes(imageBase64, `api-${Date.now()}`);
        return (embedding && embedding.length === 2048) ? embedding : null;
    } catch (err) {
        console.error('[embedding-singleton] Generation from bytes failed:', (err as Error).message);
        return null;
    }
}

export async function searchSimilar(
    embedding: number[],
    opts: { species?: string; limit?: number; threshold?: number } = {},
): Promise<SearchMatch[]> {
    // Use Zilliz Node.js SDK directly (no Python needed)
    return searchSimilarAnimals(embedding, opts);
}

export async function embedAndInsert(
    id: string,
    photoUrl: string,
    metadata?: { species?: string; shelterId?: string; ageSegment?: string },
): Promise<boolean> {
    const provider = await getProvider();
    if (!provider?.embedAndInsert) return false;
    try {
        return await provider.embedAndInsert(id, photoUrl, metadata);
    } catch (err) {
        console.error('[embedding-singleton] Embed+insert failed:', (err as Error).message);
        return false;
    }
}

export function isReady(): boolean {
    return _provider?.ready ?? false;
}
