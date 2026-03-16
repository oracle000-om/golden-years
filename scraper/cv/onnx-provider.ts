/**
 * ONNX Embedding Provider — Node.js Native ResNet50 Embeddings
 *
 * Generates 2048-d L2-normalized ResNet50 embeddings using ONNX Runtime
 * for Node.js. Produces identical embeddings to the Python worker but
 * without requiring Python, PyTorch, or a subprocess.
 *
 * Works on Vercel serverless, GitHub Actions, and local dev.
 *
 * Requirements:
 *   npm install onnxruntime-node sharp
 *   python3 scraper/cv/export_resnet50_onnx.py  (one-time ONNX export)
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { EmbeddingProvider, SearchMatch } from './embedding';

// Re-export constants for compatibility
export const ONNX_EMBEDDING_DIM = 2048;
export const ONNX_EMBEDDING_MODEL = 'resnet50-onnx-v1';

const MODEL_PATH = join(__dirname, '..', '..', 'data', 'resnet50-embedding.onnx');

// ImageNet normalization constants
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * Create an ONNX-based embedding provider. Returns null if the ONNX model
 * file is missing or onnxruntime-node is not installed.
 */
export async function createOnnxEmbeddingProvider(): Promise<EmbeddingProvider | null> {
    if (!existsSync(MODEL_PATH)) {
        console.warn(`⚠ ONNX model not found at ${MODEL_PATH}. Run: python3 scraper/cv/export_resnet50_onnx.py`);
        return null;
    }

    try {
        const provider = new OnnxEmbeddingProvider();
        await provider.initialize();
        return provider;
    } catch (err) {
        console.error(`⚠ ONNX embedding provider failed to initialize: ${(err as Error).message}`);
        return null;
    }
}

class OnnxEmbeddingProvider implements EmbeddingProvider {
    private session: any = null; // ort.InferenceSession
    private _ready = false;
    private _model = ONNX_EMBEDDING_MODEL;
    private _vectorCount = 0;

    get ready() { return this._ready; }
    get model() { return this._model; }
    get vectorCount() { return this._vectorCount; }

    async initialize(): Promise<void> {
        // Dynamic require to avoid type declaration issues
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ort = require('onnxruntime-node');
        this.session = await ort.InferenceSession.create(MODEL_PATH, {
            executionProviders: ['cpu'],
        });
        this._ready = true;
        console.log(`[onnx-embedding] Model loaded: ${MODEL_PATH}`);
    }

    async generateEmbedding(photoUrl: string, id: string): Promise<number[] | null> {
        const imageData = await downloadAndPreprocess(photoUrl);
        if (!imageData) return null;
        return this.runInference(imageData);
    }

    async generateEmbeddingFromBytes(base64Data: string, id: string): Promise<number[] | null> {
        const imageData = await preprocessBase64(base64Data);
        if (!imageData) return null;
        return this.runInference(imageData);
    }

    // Embedding-only provider — search/insert/delete delegate to Zilliz or Milvus
    async embedAndInsert(_id: string, _photoUrl: string, _metadata?: any): Promise<boolean> {
        console.warn('[onnx-embedding] embedAndInsert not supported — use search API with Zilliz');
        return false;
    }

    async search(_embedding: number[], _opts?: any): Promise<SearchMatch[]> {
        console.warn('[onnx-embedding] search not supported — use Zilliz Cloud API directly');
        return [];
    }

    async deleteEmbeddings(_ids: string[]): Promise<boolean> {
        return false;
    }

    async count(): Promise<number> {
        return 0;
    }

    async deleteVectors(_ids: string[]): Promise<void> {
        // No-op — ONNX provider doesn't manage a vector store
    }

    async getVectorCount(): Promise<number> {
        return 0;
    }

    async shutdown(): Promise<void> {
        this.session = null;
        this._ready = false;
    }

    private async runInference(preprocessed: Float32Array): Promise<number[]> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ort = require('onnxruntime-node');
        const tensor = new ort.Tensor('float32', preprocessed, [1, 3, 224, 224]);
        const results = await this.session.run({ input: tensor });
        const embedding = Array.from(results.embedding.data as Float32Array);

        // L2 normalize (same as Python worker)
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        if (norm > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= norm;
            }
        }
        return embedding;
    }
}

/**
 * Download an image and preprocess for ResNet50 inference.
 * Returns a Float32Array in NCHW format [1, 3, 224, 224].
 */
async function downloadAndPreprocess(url: string): Promise<Float32Array | null> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15_000),
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 OnnxEmbedding' },
        });
        if (!response.ok) return null;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 500) return null;
        return preprocessBuffer(buffer);
    } catch {
        return null;
    }
}

/**
 * Preprocess base64-encoded image data.
 */
async function preprocessBase64(base64Data: string): Promise<Float32Array | null> {
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length < 500) return null;
        return preprocessBuffer(buffer);
    } catch {
        return null;
    }
}

/**
 * Preprocess an image buffer: resize to 224x224, convert to RGB float tensor,
 * apply ImageNet normalization. Returns NCHW format.
 */
async function preprocessBuffer(buffer: Buffer): Promise<Float32Array | null> {
    try {
        // Dynamic import so sharp is optional
        const sharp = (await import('sharp')).default;

        // Resize to 224x224 and extract raw RGB pixels
        const { data, info } = await sharp(buffer)
            .resize(224, 224, { fit: 'cover' })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        if (info.channels !== 3) return null;

        // Convert to NCHW float tensor with ImageNet normalization
        const tensor = new Float32Array(3 * 224 * 224);
        const pixelCount = 224 * 224;

        for (let i = 0; i < pixelCount; i++) {
            const r = data[i * 3] / 255.0;
            const g = data[i * 3 + 1] / 255.0;
            const b = data[i * 3 + 2] / 255.0;

            tensor[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];                    // R channel
            tensor[pixelCount + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];        // G channel
            tensor[2 * pixelCount + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];    // B channel
        }

        return tensor;
    } catch {
        return null;
    }
}
