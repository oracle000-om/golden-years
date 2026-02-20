/**
 * CV Age Estimation — Gemini Provider
 *
 * Gemini 2.0 Flash implementation of AgeEstimationProvider.
 * Uses @google/genai SDK (current, non-deprecated package).
 *
 * Pipeline:
 *   1. Download photo from URL
 *   2. Photo quality pre-check via sharp (reject corrupt/tiny/blank images)
 *   3. Resize to 256×256 to minimize token usage
 *   4. Send to Gemini with structured prompt
 *   5. Parse JSON response into AgeEstimate
 *
 * Cost: ~$0.05–$0.20/month at expected volumes.
 */

import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { AGE_ESTIMATION_PROMPT } from './prompts';
import type { AgeEstimate, AgeEstimationProvider } from './types';

const MODEL = 'gemini-2.5-flash';
const TARGET_SIZE = 256;
const MIN_DIMENSION = 50;

/**
 * Download an image from a URL and return as Buffer.
 * Relaxed content-type check: many shelter APIs serve images
 * as application/octet-stream or with no content-type header.
 */
async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;

        const contentType = response.headers.get('content-type') || '';
        // Reject only things that are clearly NOT images (HTML, JSON, etc.)
        if (contentType.startsWith('text/html') || contentType.startsWith('application/json')) return null;

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 500) return null; // too small to be a photo
        return Buffer.from(arrayBuffer);
    } catch {
        return null;
    }
}

/**
 * Pre-check image quality before sending to Gemini.
 * Rejects images that are too small, corrupt, or blank.
 * Returns the resized image buffer if it passes, null otherwise.
 */
async function preprocessImage(imageBuffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        const metadata = await sharp(imageBuffer).metadata();

        // Reject images that are too small to be useful
        if (!metadata.width || !metadata.height) return null;
        if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) return null;

        // Resize to target size for cost optimization
        const resized = await sharp(imageBuffer)
            .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer();

        // Reject suspiciously small output (likely blank/corrupt)
        if (resized.length < 1000) return null;

        return { buffer: resized, mimeType: 'image/jpeg' };
    } catch {
        return null;
    }
}

/**
 * Parse Gemini's text response into an AgeEstimate.
 * Returns null if the response can't be parsed.
 */
function parseResponse(text: string): AgeEstimate | null {
    try {
        // Strip any markdown code fences Gemini might add
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Validate required fields
        if (
            typeof parsed.estimatedAgeLow !== 'number' ||
            typeof parsed.estimatedAgeHigh !== 'number' ||
            typeof parsed.isSenior !== 'boolean' ||
            !['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(parsed.confidence)
        ) {
            return null;
        }

        // Reject NONE confidence — means the model couldn't assess
        if (parsed.confidence === 'NONE') return null;

        return {
            species: ['DOG', 'CAT', 'OTHER'].includes(parsed.species) ? parsed.species : 'OTHER',
            estimatedAgeLow: parsed.estimatedAgeLow,
            estimatedAgeHigh: parsed.estimatedAgeHigh,
            isSenior: parsed.isSenior,
            confidence: parsed.confidence,
            indicators: Array.isArray(parsed.indicators) ? parsed.indicators : [],
            detectedBreeds: Array.isArray(parsed.detectedBreeds) ? parsed.detectedBreeds : [],
            breedConfidence: ['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(parsed.breedConfidence)
                ? parsed.breedConfidence
                : 'NONE',
        };
    } catch {
        return null;
    }
}

/**
 * Create a Gemini-backed AgeEstimationProvider.
 */
export function createGeminiProvider(apiKey: string): AgeEstimationProvider {
    const genai = new GoogleGenAI({ apiKey });

    return {
        async estimateAge(photoUrl: string): Promise<AgeEstimate | null> {
            // Step 1: Download the image
            const imageBuffer = await downloadImage(photoUrl);
            if (!imageBuffer) {
                console.log('      ⚠ Could not download image');
                return null;
            }

            // Step 2: Pre-check quality and resize
            const processed = await preprocessImage(imageBuffer);
            if (!processed) {
                console.log('      ⚠ Image failed quality pre-check');
                return null;
            }

            // Step 3: Send to Gemini
            try {
                const response = await genai.models.generateContent({
                    model: MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: processed.mimeType,
                                        data: processed.buffer.toString('base64'),
                                    },
                                },
                                { text: AGE_ESTIMATION_PROMPT },
                            ],
                        },
                    ],
                });

                const text = response.text;
                if (!text) {
                    console.log('      ⚠ Empty response from Gemini');
                    return null;
                }

                // Step 4: Parse response
                const estimate = parseResponse(text);
                if (!estimate) {
                    console.log('      ⚠ Could not parse Gemini response');
                    return null;
                }

                return estimate;
            } catch (error) {
                console.error('      ❌ Gemini API error:', (error as Error).message);
                return null;
            }
        },
    };
}
