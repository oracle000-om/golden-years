/**
 * CV Animal Assessment — Gemini Provider
 *
 * Tiered Gemini implementation of AssessmentProvider.
 * Uses @google/genai SDK with structured output (responseSchema).
 *
 * v4 — Tiered model strategy:
 *   1. Try gemini-2.0-flash-lite (cheap/fast) first
 *   2. If result is null or LOW confidence, retry with gemini-2.5-flash
 *   3. Track which model produced the final result
 *
 * Pipeline:
 *   1. Download photo from URL
 *   2. Photo quality pre-check via sharp (reject corrupt/tiny/blank images)
 *   3. Resize to 512×512 for health/behavioral signal detection
 *   4. Send to Gemini with structured prompt + JSON schema enforcement
 *   5. Parse + validate JSON response into AnimalAssessment
 *   6. If LOW confidence, retry with full model
 */

import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import { ANIMAL_ASSESSMENT_PROMPT } from './prompts';
import { CLOSE_UP_ASSESSMENT_PROMPT } from './close-up-prompt';
import type { AnimalAssessment, CloseUpAssessment, AssessmentProvider, AgeEstimationProvider, AssessmentContext } from './types';
import type { CalibrationConfig } from './calibration-config';

const MODEL_FAST = 'gemini-2.0-flash-lite';
const MODEL_FULL = 'gemini-2.5-flash';
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

    async function assess(photoUrl: string, additionalPhotos?: string[], context?: AssessmentContext, calibration?: CalibrationConfig, videoFrames?: Buffer[]): Promise<AnimalAssessment | null> {
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

        // Step 3b: Add video key frames (pre-processed JPEG buffers)
        if (videoFrames && videoFrames.length > 0) {
            for (const frame of videoFrames.slice(0, 4)) {
                const p = await preprocessImage(frame);
                if (p) allProcessed.push(p);
            }
        }

        const isMultiPhoto = allProcessed.length > 1;
        const hasVideoFrames = videoFrames && videoFrames.length > 0;

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
            contextLines.push(`You are provided with ${allProcessed.length} images of the SAME animal${hasVideoFrames ? ' (including key frames extracted from a video)' : ''}. Synthesize your assessment across ALL images for maximum accuracy. Different angles help with breed identification (side profiles), body condition scoring (full body), and health assessment (close-ups). Use the combination of all views.`);
        }
        if (hasVideoFrames) {
            contextLines.push('Some images are KEY FRAMES from a video. Use these for behavioral analysis: assess body language, gait, energy level, and any visible behavioral patterns that photos alone cannot capture.');
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

        // Inject calibration prompt addendum if provided
        if (calibration?.promptAddendum) {
            contextLines.push(`CALIBRATION TUNING: ${calibration.promptAddendum}`);
        }

        const promptText = contextLines.length > 0
            ? `${contextLines.join('\n\n')}\n\n${ANIMAL_ASSESSMENT_PROMPT}`
            : ANIMAL_ASSESSMENT_PROMPT;

        parts.push({ text: promptText });

        // Step 5: Send to Gemini — tiered model strategy
        // Try cheap model first, fall back to full model for LOW confidence
        async function callModel(model: string): Promise<AnimalAssessment | null> {
            try {
                const response = await genai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts }],
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: ASSESSMENT_SCHEMA,
                    },
                });

                const text = response.text;
                if (!text) return null;

                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(text);
                } catch {
                    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    parsed = JSON.parse(cleaned);
                }

                const estimate = validateResponse(parsed);
                if (estimate) {
                    estimate.modelUsed = model;
                }
                return estimate;
            } catch (error) {
                console.error(`      ❌ Gemini API error (${model}):`, (error as Error).message);
                return null;
            }
        }

        // Tier 1: Try fast/cheap model
        let estimate = await callModel(MODEL_FAST);

        // Tier 2: Fall back to full model if lite returned null or LOW confidence
        if (!estimate || estimate.confidence === 'LOW') {
            const liteResult = estimate?.confidence || 'null';
            console.log(`      🔄 Lite model returned ${liteResult} — retrying with full model`);
            const fullEstimate = await callModel(MODEL_FULL);
            if (fullEstimate) {
                estimate = fullEstimate;
            }
            // If full also fails, keep the lite LOW result (better than nothing)
        }

        if (!estimate) {
            console.log('      ⚠ Both models failed to produce a valid assessment');
            return null;
        }

        const modelTag = estimate.modelUsed === MODEL_FAST ? '[LITE]' : '[FLASH]';
        if (isMultiPhoto) {
            console.log(`      📸 ${modelTag} Multi-photo assessment (${allProcessed.length} images)`);
        }
        if (estimate.dataConflicts.length > 0) {
            console.log(`      ⚠ Data conflicts: ${estimate.dataConflicts.join(' | ')}`);
        }

        // Apply calibration confidence floor
        if (calibration?.minConfidence) {
            const confidenceRank: Record<string, number> = { 'NONE': 0, 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 };
            const minRank = confidenceRank[calibration.minConfidence] || 1;
            const resultRank = confidenceRank[estimate.confidence] || 0;
            if (resultRank < minRank) {
                console.log(`      ⚠ Below confidence floor (${estimate.confidence} < ${calibration.minConfidence}) — rejecting`);
                return null;
            }
        }

        // Step 6: Secondary close-up assessment (dental/eye)
        // Trigger when primary assessment detected dental or cataract indicators
        const dentalKeywords = ['dental', 'teeth', 'tartar', 'gum', 'oral', 'tooth', 'mouth'];
        const eyeKeywords = ['cataract', 'eye', 'cloudy', 'opacity', 'lens', 'vision'];
        const allText = [
            ...(estimate.visibleConditions || []),
            ...(estimate.likelyCareNeeds || []),
            estimate.healthNotes || '',
        ].join(' ').toLowerCase();

        const hasDentalSignals = dentalKeywords.some(kw => allText.includes(kw));
        const hasEyeSignals = eyeKeywords.some(kw => allText.includes(kw));

        if (hasDentalSignals || hasEyeSignals) {
            try {
                const closeUpResult = await runCloseUpAssessment(
                    genai, allProcessed[0], hasDentalSignals, hasEyeSignals
                );
                if (closeUpResult && closeUpResult.isCloseUp) {
                    estimate.dentalGrade = closeUpResult.dentalGrade;
                    estimate.tartarSeverity = closeUpResult.tartarSeverity;
                    estimate.dentalNotes = closeUpResult.dentalNotes;
                    estimate.cataractStage = closeUpResult.cataractStage;
                    estimate.eyeNotes = closeUpResult.eyeNotes;
                    console.log(`      🦷 Close-up: dental=${closeUpResult.dentalGrade ?? '?'}/4, eyes=${closeUpResult.cataractStage ?? 'n/a'}`);
                }
            } catch {
                // Non-fatal — close-up is supplementary
            }
        }

        return estimate;
    }

    /**
     * Run focused dental/eye assessment on the primary photo.
     * Uses MODEL_FAST since grading is a simpler task than full assessment.
     */
    async function runCloseUpAssessment(
        ai: GoogleGenAI,
        photo: { buffer: Buffer; mimeType: string },
        checkDental: boolean,
        checkEyes: boolean,
    ): Promise<CloseUpAssessment | null> {
        const CLOSE_UP_SCHEMA = {
            type: Type.OBJECT,
            properties: {
                isCloseUp: { type: Type.BOOLEAN },
                dentalGrade: { type: Type.NUMBER, nullable: true },
                tartarSeverity: { type: Type.STRING, nullable: true, enum: ['none', 'mild', 'moderate', 'severe'] },
                dentalNotes: { type: Type.STRING, nullable: true },
                cataractStage: { type: Type.STRING, nullable: true, enum: ['none', 'early', 'moderate', 'advanced'] },
                eyeNotes: { type: Type.STRING, nullable: true },
            },
            required: ['isCloseUp'],
        };

        const focus = [checkDental && 'dental health', checkEyes && 'eye health'].filter(Boolean).join(' and ');
        const prompt = `Focus on assessing ${focus} in this photo.\n\n${CLOSE_UP_ASSESSMENT_PROMPT}`;

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: photo.mimeType, data: photo.buffer.toString('base64') } },
                    { text: prompt },
                ],
            }],
            config: {
                responseMimeType: 'application/json',
                responseSchema: CLOSE_UP_SCHEMA,
            },
        });

        const text = response.text;
        if (!text) return null;

        try {
            const parsed = JSON.parse(text);
            return {
                isCloseUp: Boolean(parsed.isCloseUp),
                dentalGrade: typeof parsed.dentalGrade === 'number' ? Math.min(4, Math.max(1, Math.round(parsed.dentalGrade))) : null,
                tartarSeverity: parsed.tartarSeverity || null,
                dentalNotes: parsed.dentalNotes || null,
                cataractStage: parsed.cataractStage || null,
                eyeNotes: parsed.eyeNotes || null,
            };
        } catch {
            return null;
        }
    }

    return {
        assess,
        estimateAge: assess,  // backward compat
    };
}

