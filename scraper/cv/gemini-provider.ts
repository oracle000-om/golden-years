/**
 * CV Animal Assessment — Gemini Provider
 *
 * Gemini 2.5 Flash implementation of AssessmentProvider.
 * Uses @google/genai SDK with structured output (responseSchema).
 *
 * Pipeline:
 *   1. Download photo from URL
 *   2. Photo quality pre-check via sharp (reject corrupt/tiny/blank images)
 *   3. Resize to 512×512 for health/behavioral signal detection
 *   4. Send to Gemini with structured prompt + JSON schema enforcement
 *   5. Parse + validate JSON response into AnimalAssessment
 *
 * v3: Structured output via responseSchema, cross-validation context,
 *     dataConflicts field, few-shot examples in prompt.
 */

import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import { ANIMAL_ASSESSMENT_PROMPT } from './prompts';
import type { AnimalAssessment, AssessmentProvider, AgeEstimationProvider, AssessmentContext } from './types';

const MODEL = 'gemini-2.5-flash';
const TARGET_SIZE = 512;  // v2: increased from 256 for better health/behavioral detection
const MIN_DIMENSION = 50;

/**
 * JSON Schema for structured output — matches AnimalAssessment type.
 * Gemini will enforce this schema and return clean JSON.
 */
const ASSESSMENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        species: { type: Type.STRING, enum: ['DOG', 'CAT', 'OTHER'] },
        estimatedAgeLow: { type: Type.NUMBER },
        estimatedAgeHigh: { type: Type.NUMBER },
        isSenior: { type: Type.BOOLEAN },
        confidence: { type: Type.STRING, enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
        detectedBreeds: { type: Type.ARRAY, items: { type: Type.STRING } },
        breedConfidence: { type: Type.STRING, enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'] },
        bodyConditionScore: { type: Type.NUMBER, nullable: true },
        coatCondition: { type: Type.STRING, enum: ['good', 'fair', 'poor'], nullable: true },
        visibleConditions: { type: Type.ARRAY, items: { type: Type.STRING } },
        healthNotes: { type: Type.STRING, nullable: true },
        aggressionRisk: { type: Type.NUMBER },
        fearIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
        stressLevel: { type: Type.STRING, enum: ['low', 'moderate', 'high'], nullable: true },
        behaviorNotes: { type: Type.STRING, nullable: true },
        photoQuality: { type: Type.STRING, enum: ['good', 'acceptable', 'poor'] },
        likelyCareNeeds: { type: Type.ARRAY, items: { type: Type.STRING } },
        estimatedCareLevel: { type: Type.STRING, enum: ['low', 'moderate', 'high'] },
        dataConflicts: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: [
        'species', 'estimatedAgeLow', 'estimatedAgeHigh', 'isSenior',
        'confidence', 'indicators', 'detectedBreeds', 'breedConfidence',
        'aggressionRisk', 'photoQuality', 'likelyCareNeeds',
        'estimatedCareLevel', 'dataConflicts',
    ],
};

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
            .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'inside' })
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
 * Canonical age indicators — only these values are stored.
 */
const VALID_INDICATORS = new Set([
    'muzzle greying',
    'coat thinning',
    'cataracts',
    'clear eyes',
    'healthy coat',
    'muscle wasting',
    'overweight',
    'stiff posture',
    'dental wear',
    'skin lumps',
    'mature face',
    'youthful appearance',
]);

/**
 * Validate and normalize a parsed Gemini response into an AnimalAssessment.
 * With structured output, we get clean JSON — this is a safety net for
 * range clamping, canonical indicator filtering, and default values.
 */
function validateResponse(parsed: Record<string, unknown>): AnimalAssessment | null {
    try {
        // Validate required fields (v1 core)
        if (
            typeof parsed.estimatedAgeLow !== 'number' ||
            typeof parsed.estimatedAgeHigh !== 'number' ||
            typeof parsed.isSenior !== 'boolean' ||
            !['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(parsed.confidence as string)
        ) {
            return null;
        }

        // Reject NONE confidence — means the model couldn't assess
        if (parsed.confidence === 'NONE') return null;

        // Filter indicators to canonical set only
        const rawIndicators = Array.isArray(parsed.indicators) ? parsed.indicators : [];
        const indicators = rawIndicators
            .map((i: string) => (typeof i === 'string' ? i.toLowerCase().trim() : ''))
            .filter((i: string) => VALID_INDICATORS.has(i));

        return {
            // ── v1 fields ──
            species: ['DOG', 'CAT', 'OTHER'].includes(parsed.species as string) ? parsed.species as 'DOG' | 'CAT' | 'OTHER' : 'OTHER',
            estimatedAgeLow: parsed.estimatedAgeLow as number,
            estimatedAgeHigh: parsed.estimatedAgeHigh as number,
            isSenior: parsed.isSenior as boolean,
            confidence: parsed.confidence as 'HIGH' | 'MEDIUM' | 'LOW',
            indicators,
            detectedBreeds: Array.isArray(parsed.detectedBreeds) ? parsed.detectedBreeds : [],
            breedConfidence: ['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(parsed.breedConfidence as string)
                ? parsed.breedConfidence as 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
                : 'NONE',

            // ── v2: health ──
            bodyConditionScore: typeof parsed.bodyConditionScore === 'number'
                ? Math.min(9, Math.max(1, Math.round(parsed.bodyConditionScore)))
                : null,
            coatCondition: ['good', 'fair', 'poor'].includes(parsed.coatCondition as string)
                ? parsed.coatCondition as 'good' | 'fair' | 'poor'
                : null,
            visibleConditions: Array.isArray(parsed.visibleConditions) ? parsed.visibleConditions : [],
            healthNotes: typeof parsed.healthNotes === 'string' ? parsed.healthNotes : null,

            // ── v2: behavioral ──
            aggressionRisk: typeof parsed.aggressionRisk === 'number'
                ? Math.min(5, Math.max(1, Math.round(parsed.aggressionRisk)))
                : 1,
            fearIndicators: Array.isArray(parsed.fearIndicators) ? parsed.fearIndicators : [],
            stressLevel: ['low', 'moderate', 'high'].includes(parsed.stressLevel as string)
                ? parsed.stressLevel as 'low' | 'moderate' | 'high'
                : null,
            behaviorNotes: typeof parsed.behaviorNotes === 'string' ? parsed.behaviorNotes : null,

            // ── v2: photo quality ──
            photoQuality: ['good', 'acceptable', 'poor'].includes(parsed.photoQuality as string)
                ? parsed.photoQuality as 'good' | 'acceptable' | 'poor'
                : 'acceptable',

            // ── v2: care needs ──
            likelyCareNeeds: Array.isArray(parsed.likelyCareNeeds) ? parsed.likelyCareNeeds : [],
            estimatedCareLevel: ['low', 'moderate', 'high'].includes(parsed.estimatedCareLevel as string)
                ? parsed.estimatedCareLevel as 'low' | 'moderate' | 'high'
                : 'moderate',

            // ── v3: cross-validation ──
            dataConflicts: Array.isArray(parsed.dataConflicts) ? parsed.dataConflicts : [],
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

    const MAX_ADDITIONAL_PHOTOS = 4; // cap at 5 total (1 primary + 4 extra)

    async function assess(photoUrl: string, additionalPhotos?: string[], context?: AssessmentContext): Promise<AnimalAssessment | null> {
        // Step 1: Download the primary image
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

        // Step 3: Download and preprocess additional photos (best-effort)
        const allProcessed: { buffer: Buffer; mimeType: string }[] = [processed];

        if (additionalPhotos && additionalPhotos.length > 0) {
            const extras = additionalPhotos.slice(0, MAX_ADDITIONAL_PHOTOS);
            const downloads = await Promise.all(extras.map(url => downloadImage(url)));
            for (const buf of downloads) {
                if (!buf) continue;
                const p = await preprocessImage(buf);
                if (p) allProcessed.push(p);
            }
        }

        const isMultiPhoto = allProcessed.length > 1;

        // Step 4: Build parts — all images + prompt
        const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

        for (const img of allProcessed) {
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.buffer.toString('base64'),
                },
            });
        }

        // Build context preamble from shelter listing data
        const contextLines: string[] = [];
        if (isMultiPhoto) {
            contextLines.push(`You are provided with ${allProcessed.length} photos of the SAME animal. Synthesize your assessment across ALL photos for maximum accuracy. Different angles help with breed identification (side profiles), body condition scoring (full body), and health assessment (close-ups). Use the combination of all views.`);
        }
        if (context?.shelterSize) {
            contextLines.push(`SHELTER-REPORTED SIZE: ${context.shelterSize}. Since all animals on this platform are seniors (full-grown adults), the shelter-reported size is a reliable indicator. Factor this into your breed identification.`);
        }
        if (context?.shelterAge != null) {
            contextLines.push(`SHELTER-REPORTED AGE: ${context.shelterAge} years. Compare this to your visual assessment and flag any significant discrepancy (3+ years) in dataConflicts.`);
        }
        if (context?.shelterBreed) {
            contextLines.push(`SHELTER-REPORTED BREED: ${context.shelterBreed}. Compare this to your visual breed detection and flag any implausible mismatch in dataConflicts.`);
        }
        if (context?.shelterNotes) {
            // Truncate very long notes to avoid token waste
            const truncated = context.shelterNotes.length > 500
                ? context.shelterNotes.substring(0, 500) + '...'
                : context.shelterNotes;
            contextLines.push(`SHELTER NOTES: "${truncated}". Cross-reference any health or behavioral claims with what you observe in the photo.`);
        }

        const promptText = contextLines.length > 0
            ? `${contextLines.join('\n\n')}\n\n${ANIMAL_ASSESSMENT_PROMPT}`
            : ANIMAL_ASSESSMENT_PROMPT;

        parts.push({ text: promptText });

        // Step 5: Send to Gemini with structured output
        try {
            const response = await genai.models.generateContent({
                model: MODEL,
                contents: [{ role: 'user', parts }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: ASSESSMENT_SCHEMA,
                },
            });

            const text = response.text;
            if (!text) {
                console.log('      ⚠ Empty response from Gemini');
                return null;
            }

            // Step 6: Parse and validate response
            // With structured output, JSON.parse should always succeed,
            // but we keep validateResponse as a safety net for range clamping
            let parsed: Record<string, unknown>;
            try {
                parsed = JSON.parse(text);
            } catch {
                // Fallback: try stripping any residual markdown fences
                const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                parsed = JSON.parse(cleaned);
            }

            const estimate = validateResponse(parsed);
            if (!estimate) {
                console.log('      ⚠ Could not validate Gemini response');
                return null;
            }

            if (isMultiPhoto) {
                console.log(`      📸 Multi-photo assessment (${allProcessed.length} images)`);
            }
            if (estimate.dataConflicts.length > 0) {
                console.log(`      ⚠ Data conflicts: ${estimate.dataConflicts.join(' | ')}`);
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

