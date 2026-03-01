/**
 * CV Animal Assessment — Gemini Provider
 *
 * Tiered Gemini implementation of AssessmentProvider.
 * Uses @google/genai SDK with structured output (responseSchema).
 *
 * v5 — Blind assessment + integrity hardening:
 *   1. URL-pattern filtering (reject known non-photo URLs)
 *   2. Photo quality pre-check (reject placeholders, corrupt, tiny)
 *   3. Blind visual-only assessment (no shelter text in prompt)
 *   4. Tiered model: gemini-2.5-flash-lite → gemini-2.5-flash fallback
 *   5. Reject LOW confidence and species=OTHER results
 *   6. Cross-validate with shelter data in code (zero extra API cost)
 *
 * Pipeline:
 *   1. URL filter → Download → Preprocess (sharp)
 *   2. Send to Gemini with visual-only prompt (no shelter age/breed/notes)
 *   3. Validate + reject non-animals and low confidence
 *   4. Cross-validate with shelter context in code
 *   5. Optional close-up dental/eye assessment
 */

import { GoogleGenAI, Type } from '@google/genai';
import sharp from 'sharp';
import { ANIMAL_ASSESSMENT_PROMPT } from './prompts';
import { CLOSE_UP_ASSESSMENT_PROMPT } from './close-up-prompt';
import type { AnimalAssessment, CloseUpAssessment, AssessmentProvider, AgeEstimationProvider, AssessmentContext } from './types';
import type { CalibrationConfig } from './calibration-config';

const MODEL_FAST = 'gemini-2.5-flash-lite';
const MODEL_FULL = 'gemini-2.5-flash';
const TARGET_SIZE = 512;  // v2: increased from 256 for better health/behavioral detection
const MIN_DIMENSION = 50;
const MIN_PHOTO_DIMENSION = 300; // real animal photos are almost always larger than 300px
const MIN_RAW_BYTES = 5000;      // 5KB — real photos are typically 50KB+; placeholders are often < 10KB

/**
 * Known placeholder image perceptual hashes (8×8 grayscale pHash).
 * These are generic "No Image Available" graphics served by shelter APIs
 * when an animal has no photo. Gemini will hallucinate CV data from these.
 */
const PLACEHOLDER_HASHES = new Set([
    '0f1e200121e5e7ff', // 24PetConnect "No Image Available" (232×246 PNG)
]);

/**
 * Compute a quick 8×8 grayscale perceptual hash for placeholder detection.
 * Same algorithm as dedup/index.ts but operates on a Buffer directly.
 */
async function computeQuickHash(imageBuffer: Buffer): Promise<string | null> {
    try {
        const pixels = await sharp(imageBuffer)
            .resize(8, 8, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

        let sum = 0;
        for (let i = 0; i < 64; i++) sum += pixels[i];
        const mean = sum / 64;

        let hashBits = '';
        for (let i = 0; i < 64; i++) hashBits += pixels[i] >= mean ? '1' : '0';

        let hex = '';
        for (let i = 0; i < 64; i += 4) {
            hex += parseInt(hashBits.substring(i, i + 4), 2).toString(16);
        }
        return hex;
    } catch {
        return null;
    }
}

/**
 * URL patterns that indicate the URL is NOT a real animal photo.
 * Checks the URL path/filename for known non-photo indicators.
 */
const NON_PHOTO_PATTERNS = [
    /\/no[-_]?image/i,
    /\/no[-_]?photo/i,
    /\/placeholder/i,
    /\/default[-_.]?(image|photo|pic|img)?\./i,
    /\/coming[-_]?soon/i,
    /\/logo\b/i,
    /\/favicon/i,
    /\/no[-_]?pic/i,
    /\/generic[-_.]?(pet|animal|dog|cat)?\./i,
    /\/image[-_]?not[-_]?available/i,
    /\/photo[-_]?unavailable/i,
    /\/nophoto\./i,
    /\/pet[-_]?default/i,
];

/**
 * Check if a URL is a known non-photo path (shelter logo, default image, etc.)
 * Returns true if the URL should be SKIPPED.
 */
function isKnownNonPhotoUrl(url: string): boolean {
    try {
        const path = new URL(url).pathname;
        return NON_PHOTO_PATTERNS.some(re => re.test(path));
    } catch {
        return false; // if URL parsing fails, let download try
    }
}

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
        estimatedWeightLbs: { type: Type.NUMBER, nullable: true },
        mobilityAssessment: { type: Type.STRING, enum: ['normal', 'limited', 'impaired'], nullable: true },
        mobilityNotes: { type: Type.STRING, nullable: true },
        energyLevel: { type: Type.STRING, enum: ['low', 'moderate', 'high'], nullable: true },
        groomingNeeds: { type: Type.STRING, enum: ['minimal', 'regular', 'extensive'], nullable: true },
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
        if (arrayBuffer.byteLength < MIN_RAW_BYTES) return null; // too small to be a real animal photo
        return Buffer.from(arrayBuffer);
    } catch {
        return null;
    }
}

/**
 * Pre-check image quality before sending to Gemini.
 * Rejects images that are too small, corrupt, blank, or placeholder graphics.
 * Returns the resized image buffer if it passes, null otherwise.
 */
async function preprocessImage(imageBuffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        const metadata = await sharp(imageBuffer).metadata();

        // Reject images that are too small to be useful
        if (!metadata.width || !metadata.height) return null;
        if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) return null;

        // Reject small images — real animal photos are almost always > 300px.
        // Placeholder graphics ("No Image Available") are typically tiny.
        if (metadata.width <= MIN_PHOTO_DIMENSION && metadata.height <= MIN_PHOTO_DIMENSION) {
            console.log(`      ⚠ Image too small for CV (${metadata.width}×${metadata.height}) — likely placeholder`);
            return null;
        }

        // Check against known placeholder image hashes
        const hash = await computeQuickHash(imageBuffer);
        if (hash && PLACEHOLDER_HASHES.has(hash)) {
            console.log(`      ⚠ Known placeholder image detected (hash: ${hash}) — skipping CV`);
            return null;
        }

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

        // Fix #2: Reject species=OTHER — image doesn't contain a recognizable dog/cat
        if (parsed.species === 'OTHER') return null;

        // Filter indicators to canonical set only
        const rawIndicators = Array.isArray(parsed.indicators) ? parsed.indicators : [];
        const indicators = rawIndicators
            .map((i: string) => (typeof i === 'string' ? i.toLowerCase().trim() : ''))
            .filter((i: string) => VALID_INDICATORS.has(i));

        return {
            // ── v1 fields ──
            species: parsed.species as 'DOG' | 'CAT',
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

            // ── v8: physical assessment ──
            estimatedWeightLbs: typeof parsed.estimatedWeightLbs === 'number' && parsed.estimatedWeightLbs > 0
                ? Math.round(parsed.estimatedWeightLbs as number)
                : null,
            mobilityAssessment: ['normal', 'limited', 'impaired'].includes(parsed.mobilityAssessment as string)
                ? parsed.mobilityAssessment as 'normal' | 'limited' | 'impaired'
                : null,
            mobilityNotes: typeof parsed.mobilityNotes === 'string' ? parsed.mobilityNotes : null,
            energyLevel: ['low', 'moderate', 'high'].includes(parsed.energyLevel as string)
                ? parsed.energyLevel as 'low' | 'moderate' | 'high'
                : null,
            groomingNeeds: ['minimal', 'regular', 'extensive'].includes(parsed.groomingNeeds as string)
                ? parsed.groomingNeeds as 'minimal' | 'regular' | 'extensive'
                : null,
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
        // Fix #4: URL-pattern filter — reject known non-photo URLs before download
        if (isKnownNonPhotoUrl(photoUrl)) {
            console.log('      ⚠ Known non-photo URL pattern — skipping CV');
            return null;
        }

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

        // Fix #1: Blind assessment — only inject photo/video context and size
        // (factual measurement). NO shelter age, breed, or notes to avoid anchoring.
        // Cross-validation with shelter data happens in code after the assessment.
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
                    try {
                        parsed = JSON.parse(cleaned);
                    } catch {
                        // Attempt JSON repair: truncate to last valid closing brace
                        const lastBrace = cleaned.lastIndexOf('}');
                        if (lastBrace > 0) {
                            try {
                                parsed = JSON.parse(cleaned.substring(0, lastBrace + 1));
                            } catch {
                                throw new Error(`Malformed JSON from Gemini (${cleaned.length} chars)`);
                            }
                        } else {
                            throw new Error(`No JSON object found in Gemini response`);
                        }
                    }
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
            // Fix #3: Reject LOW confidence from both models — don't store as CV_ESTIMATED
            if (estimate && estimate.confidence === 'LOW') {
                console.log('      ⚠ Both models returned LOW confidence — rejecting (not reliable enough for CV_ESTIMATED)');
                return null;
            }
        }

        if (!estimate) {
            console.log('      ⚠ Both models failed to produce a valid assessment');
            return null;
        }

        // Fix #1 continued: Cross-validate with shelter data in code (zero API cost)
        if (context) {
            crossValidateWithShelterData(estimate, context);
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
                // Smart close-up routing: send all photos, let model pick best view
                const closeUpResult = await runCloseUpAssessment(
                    genai, allProcessed, hasDentalSignals, hasEyeSignals
                );
                if (closeUpResult && closeUpResult.isCloseUp) {
                    estimate.dentalGrade = closeUpResult.dentalGrade;
                    estimate.tartarSeverity = closeUpResult.tartarSeverity;
                    estimate.dentalNotes = closeUpResult.dentalNotes;
                    estimate.cataractStage = closeUpResult.cataractStage;
                    estimate.eyeNotes = closeUpResult.eyeNotes;
                    console.log(`      🦷 Close-up: dental=${closeUpResult.dentalGrade ?? '?'}/4, eyes=${closeUpResult.cataractStage ?? 'n/a'} (${allProcessed.length} photos sent)`);
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
        photos: { buffer: Buffer; mimeType: string }[],
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
        const multiPhotoNote = photos.length > 1
            ? `You have ${photos.length} photos of the same animal. Pick the photo with the BEST view of the ${focus} for your assessment. `
            : '';
        const prompt = `${multiPhotoNote}Focus on assessing ${focus} in this photo.\n\n${CLOSE_UP_ASSESSMENT_PROMPT}`;

        // Build parts: all photos + prompt
        const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
        for (const photo of photos) {
            parts.push({ inlineData: { mimeType: photo.mimeType, data: photo.buffer.toString('base64') } });
        }
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: MODEL_FAST,
            contents: [{
                role: 'user',
                parts,
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

/**
 * Cross-validate CV assessment against shelter-reported data.
 * Populates dataConflicts deterministically in code (zero API cost).
 * Runs AFTER the blind visual assessment to avoid anchoring bias.
 */
function crossValidateWithShelterData(
    estimate: AnimalAssessment,
    context: AssessmentContext,
): void {
    const conflicts = estimate.dataConflicts || [];

    // Age cross-validation: flag if shelter age differs from CV midpoint by ≥4 years
    if (context.shelterAge != null) {
        const cvMid = (estimate.estimatedAgeLow + estimate.estimatedAgeHigh) / 2;
        const gap = Math.abs(context.shelterAge - cvMid);
        if (gap >= 4) {
            if (context.shelterAge > estimate.estimatedAgeHigh) {
                conflicts.push(`Shelter reports ${context.shelterAge}yr but visual assessment estimates ${estimate.estimatedAgeLow}–${estimate.estimatedAgeHigh}yr — animal may be younger than reported`);
            } else if (context.shelterAge < estimate.estimatedAgeLow) {
                conflicts.push(`Shelter reports ${context.shelterAge}yr but visual assessment estimates ${estimate.estimatedAgeLow}–${estimate.estimatedAgeHigh}yr — animal may be older than reported`);
            }
        }
    }

    // Breed cross-validation: flag if shelter breed has zero overlap with detected breeds
    if (context.shelterBreed && estimate.detectedBreeds.length > 0) {
        const shelterBreedLower = context.shelterBreed.toLowerCase();
        const hasOverlap = estimate.detectedBreeds.some(cvBreed => {
            const cvLower = cvBreed.toLowerCase();
            // Check for partial match (e.g., "Pit Bull" matches "American Pit Bull Terrier")
            return shelterBreedLower.includes(cvLower) || cvLower.includes(shelterBreedLower)
                || shelterBreedLower.split(/[\s/,]+/).some(word => word.length > 3 && cvLower.includes(word))
                || cvLower.split(/[\s/,]+/).some(word => word.length > 3 && shelterBreedLower.includes(word));
        });
        if (!hasOverlap) {
            conflicts.push(`Shelter lists "${context.shelterBreed}" but visual assessment detected [${estimate.detectedBreeds.join(', ')}]`);
        }
    }

    estimate.dataConflicts = conflicts;
}
