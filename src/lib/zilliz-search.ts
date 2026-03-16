/**
 * Zilliz Search — Direct Vector Search via Node.js SDK
 *
 * Replaces the Python worker's search functionality with direct
 * Zilliz Cloud API calls. Works on Vercel serverless.
 *
 * Requires ZILLIZ_ENDPOINT and ZILLIZ_TOKEN env vars.
 */

export interface SearchMatch {
    id: string;
    similarity: number;
    species?: string;
    shelter_id?: string;
    age_segment?: string;
}

let _client: any = null;
let _initializing: Promise<any> | null = null;

const COLLECTION_NAME = process.env.ZILLIZ_COLLECTION || 'pet_images';

async function getClient(): Promise<any> {
    if (_client) return _client;
    if (_initializing) return _initializing;

    _initializing = _createClient().then(c => {
        _client = c;
        _initializing = null;
        return c;
    }).catch(err => {
        console.error(`[zilliz-search] Init failed: ${(err as Error).message}`);
        _initializing = null;
        return null;
    });

    return _initializing;
}

async function _createClient(): Promise<any> {
    const endpoint = process.env.ZILLIZ_ENDPOINT;
    const token = process.env.ZILLIZ_TOKEN;

    if (!endpoint || !token) {
        console.warn('⚠ Zilliz search disabled — ZILLIZ_ENDPOINT or ZILLIZ_TOKEN not set');
        return null;
    }

    try {
        const { MilvusClient } = await import('@zilliz/milvus2-sdk-node');
        const client = new MilvusClient({
            address: endpoint,
            token,
        });
        console.log(`[zilliz-search] Connected to ${endpoint}`);
        return client;
    } catch (err) {
        console.error(`[zilliz-search] Failed to connect: ${(err as Error).message}`);
        return null;
    }
}

/**
 * Search for visually similar animals by embedding vector.
 */
export async function searchSimilarAnimals(
    embedding: number[],
    opts: { species?: string; limit?: number; threshold?: number } = {},
): Promise<SearchMatch[]> {
    const client = await getClient();
    if (!client) return [];

    const limit = opts.limit ?? 10;
    const threshold = opts.threshold ?? 0.70;

    try {
        // Build filter expression
        let filter = '';
        if (opts.species) {
            filter = `species == "${opts.species}"`;
        }

        const results = await client.search({
            collection_name: COLLECTION_NAME,
            vector: embedding,
            limit,
            ...(filter ? { filter } : {}),
            output_fields: ['pet_id', 'species', 'pet_name'],
        });

        if (!results.results || results.results.length === 0) {
            return [];
        }

        return results.results
            .filter((r: any) => r.score >= threshold)
            .map((r: any) => ({
                id: r.pet_id || r.entity?.pet_id || r.id || '',
                similarity: r.score,
                species: r.entity?.species || r.species,
            }));
    } catch (err) {
        console.error(`[zilliz-search] Search failed: ${(err as Error).message}`);
        return [];
    }
}
