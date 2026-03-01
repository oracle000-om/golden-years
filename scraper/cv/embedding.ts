/**
 * Embedding Provider — Node.js ↔ Python Subprocess Bridge
 *
 * Spawns the Python embed_worker.py process which handles both:
 * 1. ResNet50 embedding generation (2048-d vectors)
 * 2. Milvus Lite vector storage (file-based, Sniff-compatible)
 *
 * Commands:
 *   embed          — generate embedding from URL (returns vector)
 *   embed_and_insert — generate + store in Milvus in one call
 *   search         — find similar vectors
 *   count          — number of vectors stored
 *   delete         — remove vectors by ID
 */

import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { createInterface, type Interface } from 'readline';

export const EMBEDDING_DIM = 2048;
export const EMBEDDING_MODEL = 'resnet50-imagenet-v1';

interface EmbeddingResponse {
    id?: string;
    embedding?: number[] | null;
    ok: boolean;
    error?: string;
    ready?: boolean;
    model?: string;
    vectors?: number;
    cmd?: string;
    matches?: SearchMatch[];
    count?: number;
}

export interface SearchMatch {
    id: string;
    similarity: number;
    species?: string;
    shelter_id?: string;
    age_segment?: string;
}

export interface EmbeddingProvider {
    /** Generate embedding from URL (returns vector, no storage) */
    generateEmbedding(imageUrl: string, id: string): Promise<number[] | null>;

    /** Generate embedding from raw image bytes (base64-encoded) */
    generateEmbeddingFromBytes(imageBase64: string, id: string): Promise<number[] | null>;

    /** Generate embedding + store in Milvus Lite in one call */
    embedAndInsert(id: string, imageUrl: string, metadata?: {
        species?: string;
        shelterId?: string;
        ageSegment?: string;
    }): Promise<boolean>;

    /** Search for similar vectors */
    search(embedding: number[], options?: {
        species?: string;
        limit?: number;
        threshold?: number;
    }): Promise<SearchMatch[]>;

    /** Get count of stored vectors */
    count(): Promise<number>;

    /** Delete vectors by ID */
    deleteVectors(ids: string[]): Promise<void>;

    /** Shut down the worker */
    shutdown(): Promise<void>;

    readonly ready: boolean;
    readonly model: string;
    readonly vectorCount: number;
}

/**
 * Create an embedding provider. Returns null if Python or dependencies are unavailable.
 */
export async function createEmbeddingProvider(): Promise<EmbeddingProvider | null> {
    const enabled = process.env.EMBEDDING_ENABLED !== 'false';
    if (!enabled) {
        console.log('⚠ Embedding generation disabled (EMBEDDING_ENABLED=false)');
        return null;
    }

    try {
        const provider = new PythonEmbeddingProvider();
        await provider.initialize();
        return provider;
    } catch (err) {
        console.error(`⚠ Embedding provider failed to initialize: ${(err as Error).message}`);
        return null;
    }
}

class PythonEmbeddingProvider implements EmbeddingProvider {
    private process: ChildProcess | null = null;
    private rl: Interface | null = null;
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }> = new Map();
    private _ready = false;
    private _model = EMBEDDING_MODEL;
    private _vectorCount = 0;
    private requestCounter = 0;
    private initPromise: Promise<void> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private lastHeartbeat = Date.now();
    private restartCount = 0;
    private isShuttingDown = false;
    private static readonly MAX_RESTARTS = 3;
    private static readonly HEARTBEAT_INTERVAL = 30_000;  // Python sends every 30s
    private static readonly HEARTBEAT_TIMEOUT = 90_000;   // Kill if no heartbeat in 90s

    get ready(): boolean { return this._ready; }
    get model(): string { return this._model; }
    get vectorCount(): number { return this._vectorCount; }

    async initialize(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    private async _doInitialize(): Promise<void> {
        // Use process.cwd() instead of __dirname because Turbopack remaps
        // __dirname to /ROOT/... at runtime. cwd is always the project root.
        const workerPath = join(process.cwd(), 'scraper', 'cv', 'embed_worker.py');
        const pythonCmd = process.env.PYTHON_CMD || 'python3';

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.shutdown();
                reject(new Error('Python embedding worker failed to start within 120s'));
            }, 120_000);

            this.process = spawn(pythonCmd, ['-u', workerPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env },
            });

            this.process.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to spawn Python worker: ${err.message}`));
            });

            this.process.on('exit', (code) => {
                this._ready = false;
                this.stopHeartbeatMonitor();
                if (code !== 0 && code !== null) {
                    console.error(`[embedding] Python worker exited with code ${code}`);
                    // Auto-restart if not intentionally shutting down
                    if (!this.isShuttingDown && this.restartCount < PythonEmbeddingProvider.MAX_RESTARTS) {
                        this.restartCount++;
                        const delay = Math.pow(2, this.restartCount) * 1000; // 2s, 4s, 8s
                        console.log(`[embedding] Attempting restart ${this.restartCount}/${PythonEmbeddingProvider.MAX_RESTARTS} in ${delay}ms...`);
                        setTimeout(() => {
                            this.initPromise = null;
                            this.initialize().catch(err => {
                                console.error(`[embedding] Restart failed: ${(err as Error).message}`);
                            });
                        }, delay);
                    }
                }
                for (const [, pending] of this.pendingRequests) {
                    clearTimeout(pending.timer);
                    pending.resolve(null);
                }
                this.pendingRequests.clear();
            });

            this.process.stderr?.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) console.log(`[embedding] ${msg}`);
            });

            this.rl = createInterface({ input: this.process.stdout! });
            this.rl.on('line', (line) => {
                try {
                    const resp: EmbeddingResponse = JSON.parse(line);

                    if (resp.ready) {
                        this._ready = true;
                        this._model = resp.model || EMBEDDING_MODEL;
                        this._vectorCount = resp.vectors || 0;
                        this.lastHeartbeat = Date.now();
                        this.startHeartbeatMonitor();
                        clearTimeout(timeout);
                        console.log(`[embedding] Worker ready: ${this._model} (${EMBEDDING_DIM}d, ${this._vectorCount} vectors in store)`);
                        resolve();
                        return;
                    }

                    // Heartbeat from Python worker — just update timestamp
                    if ((resp as any).heartbeat) {
                        this.lastHeartbeat = Date.now();
                        return;
                    }

                    // Route response to pending request
                    const reqId = resp.id || resp.cmd || 'unknown';
                    const pending = this.pendingRequests.get(reqId);
                    if (pending) {
                        clearTimeout(pending.timer);
                        this.pendingRequests.delete(reqId);
                        pending.resolve(resp);
                    }
                } catch {
                    // Non-JSON output — ignore
                }
            });
        });
    }

    private sendRequest(reqId: string, data: Record<string, any>, timeoutMs = 30_000): Promise<EmbeddingResponse> {
        return new Promise<EmbeddingResponse>((resolve, reject) => {
            if (!this._ready || !this.process?.stdin) {
                resolve({ ok: false, error: 'Worker not ready' });
                return;
            }

            const timer = setTimeout(() => {
                this.pendingRequests.delete(reqId);
                resolve({ ok: false, error: 'Timeout' });
            }, timeoutMs);

            this.pendingRequests.set(reqId, { resolve, reject, timer });
            this.process!.stdin!.write(JSON.stringify(data) + '\n');
        });
    }

    async generateEmbedding(imageUrl: string, id: string): Promise<number[] | null> {
        const resp = await this.sendRequest(id, { cmd: 'embed', id, url: imageUrl });
        return resp.ok && resp.embedding ? resp.embedding : null;
    }

    async generateEmbeddingFromBytes(imageBase64: string, id: string): Promise<number[] | null> {
        const resp = await this.sendRequest(id, { cmd: 'embed', id, image_data: imageBase64 });
        return resp.ok && resp.embedding ? resp.embedding : null;
    }

    async embedAndInsert(id: string, imageUrl: string, metadata?: {
        species?: string;
        shelterId?: string;
        ageSegment?: string;
    }): Promise<boolean> {
        const resp = await this.sendRequest(id, {
            cmd: 'embed_and_insert',
            id,
            url: imageUrl,
            species: metadata?.species || '',
            shelter_id: metadata?.shelterId || '',
            age_segment: metadata?.ageSegment || 'UNKNOWN',
        });
        if (resp.ok) this._vectorCount++;
        return resp.ok;
    }

    async search(embedding: number[], options?: {
        species?: string;
        limit?: number;
        threshold?: number;
    }): Promise<SearchMatch[]> {
        // Use "search" as reqId — Python worker responds with {cmd: "search"}
        // and the response router matches on resp.id || resp.cmd
        const resp = await this.sendRequest('search', {
            cmd: 'search',
            embedding,
            species: options?.species,
            limit: options?.limit || 10,
            threshold: options?.threshold || 0.70,
        }, 60_000);

        // Route search responses by cmd since they don't have an id
        return resp.ok ? (resp.matches || []) : [];
    }

    async count(): Promise<number> {
        const reqId = `count-${++this.requestCounter}`;
        const resp = await this.sendRequest(reqId, { cmd: 'count' }, 5_000);
        return resp.ok ? (resp.count || 0) : this._vectorCount;
    }

    async deleteVectors(ids: string[]): Promise<void> {
        const reqId = `delete-${++this.requestCounter}`;
        await this.sendRequest(reqId, { cmd: 'delete', ids }, 10_000);
    }

    private startHeartbeatMonitor(): void {
        this.stopHeartbeatMonitor();
        this.heartbeatTimer = setInterval(() => {
            if (!this._ready || this.isShuttingDown) return;
            const elapsed = Date.now() - this.lastHeartbeat;
            if (elapsed > PythonEmbeddingProvider.HEARTBEAT_TIMEOUT) {
                console.error(`[embedding] No heartbeat for ${Math.round(elapsed / 1000)}s — force-killing worker`);
                this.process?.kill('SIGKILL');
            }
        }, PythonEmbeddingProvider.HEARTBEAT_INTERVAL);
    }

    private stopHeartbeatMonitor(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        this._ready = false;
        this.stopHeartbeatMonitor();
        if (this.rl) { this.rl.close(); this.rl = null; }
        if (this.process) {
            // Send clean shutdown command before killing
            try {
                this.process.stdin?.write(JSON.stringify({ cmd: 'shutdown' }) + '\n');
            } catch { /* stdin may already be closed */ }
            this.process.stdin?.end();
            this.process.kill('SIGTERM');
            const forceKill = setTimeout(() => { this.process?.kill('SIGKILL'); }, 5000);
            await new Promise<void>((resolve) => {
                this.process!.once('exit', () => { clearTimeout(forceKill); resolve(); });
            });
            this.process = null;
        }
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.resolve({ ok: false, error: 'Shutdown' });
        }
        this.pendingRequests.clear();
    }
}

/**
 * Compute cosine similarity between two L2-normalized embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}
