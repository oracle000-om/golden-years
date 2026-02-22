/**
 * CV Animal Assessment — Gemini Provider
 *
 * Gemini 2.5 Flash implementation of AssessmentProvider.
 * Uses @google/genai SDK.
 *
 * Pipeline:
 *   1. Download photo from URL
 *   2. Photo quality pre-check via sharp (reject corrupt/tiny/blank images)
 *   3. Resize to 512×512 for health/behavioral signal detection
 *   4. Send to Gemini with structured prompt
 *   5. Parse JSON response into AnimalAssessment
 *
 * Cost: ~$0.05–$0.20/month at expected volumes.
 */

import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { ANIMAL_ASSESSMENT_PROMPT } from './prompts';
import type { AnimalAssessment, AssessmentProvider, AgeEstimationProvider } from './types';

const MODEL = 'gemini-2.5-flash';
const TARGET_SIZE = 512;  // v2: increased from 256 for better health/behavioral detection
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
 * Parse Gemini's text response into an AnimalAssessment.
 * Returns null if the response can't be parsed.
 */
function parseResponse(text: string): AnimalAssessment | null {
    try {
        // Strip any markdown code fences Gemini might add
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Validate required fields (v1 core)
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
            // ── v1 fields ──
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

            // ── v2: health ──
            bodyConditionScore: typeof parsed.bodyConditionScore === 'number'
                ? Math.min(9, Math.max(1, Math.round(parsed.bodyConditionScore)))
                : null,
            coatCondition: ['good', 'fair', 'poor'].includes(parsed.coatCondition)
                ? parsed.coatCondition
                : null,
            visibleConditions: Array.isArray(parsed.visibleConditions) ? parsed.visibleConditions : [],
            healthNotes: typeof parsed.healthNotes === 'string' ? parsed.healthNotes : null,

            // ── v2: behavioral ──
            aggressionRisk: typeof parsed.aggressionRisk === 'number'
                ? Math.min(5, Math.max(1, Math.round(parsed.aggressionRisk)))
                : 1,
            fearIndicators: Array.isArray(parsed.fearIndicators) ? parsed.fearIndicators : [],
            stressLevel: ['low', 'moderate', 'high'].includes(parsed.stressLevel)
                ? parsed.stressLevel
                : null,
            behaviorNotes: typeof parsed.behaviorNotes === 'string' ? parsed.behaviorNotes : null,

            // ── v2: photo quality ──
            photoQuality: ['good', 'acceptable', 'poor'].includes(parsed.photoQuality)
                ? parsed.photoQuality
                : 'acceptable',

            // ── v2: care needs ──
            likelyCareNeeds: Array.isArray(parsed.likelyCareNeeds) ? parsed.likelyCareNeeds : [],
            estimatedCareLevel: ['low', 'moderate', 'high'].includes(parsed.estimatedCareLevel)
                ? parsed.estimatedCareLevel
                : 'moderate',
        };
    } catch {
        return null;
    }
}

/**
 * Create a Gemini-backed AssessmentProvider.
 * Returns both the new `assess()` and legacy `estimateAge()` methods.
 */
export function createGeminiProvider(apiKey: string): AgeEstimationProvider {
    const genai = new GoogleGenAI({ apiKey });

    async function assess(photoUrl: string): Promise<AnimalAssessment | null> {
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
                            { text: ANIMAL_ASSESSMENT_PROMPT },
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
    }

    return {
        assess,
        estimateAge: assess,  // backward compat
    };
}
