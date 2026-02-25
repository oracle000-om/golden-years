/**
 * CV Animal Assessment — Provider Factory
 *
 * Entry point for the CV pipeline. Instantiates the configured
 * provider based on environment variable CV_PROVIDER.
 *
 * Default: gemini (Gemini 2.5 Flash)
 * Future: llama-vision, self-hosted, etc.
 */

import { createGeminiProvider } from './gemini-provider';
import type { AgeEstimationProvider } from './types';

export { estimateAgeFromText } from './text-fallback';
export { lookupLifeExpectancy } from './breed-lifespan';
export { computeAssessmentDiff } from './cv-diff';
export { enrichWithBreedProfile } from './breed-enrichment';
export { extractKeyFrames, isFFmpegAvailable } from './video-frames';
export { computeCalibrationConfig } from './calibration-config';
export type { CalibrationConfig } from './calibration-config';
export type { AnimalAssessment, AgeEstimate, Confidence, AgeEstimationProvider, AssessmentProvider, AssessmentContext } from './types';
export type { AssessmentDiff, AssessmentDiffEntry } from './cv-diff';
export type { BreedEnrichment } from './breed-enrichment';
// Keep old AgeConfidence name working for existing consumers
export type { Confidence as AgeConfidence } from './types';
export type { LifeExpectancy } from './breed-lifespan';

/**
 * Create an assessment provider based on configuration.
 * Returns null if no provider is configured (CV disabled).
 */
export function createAgeEstimationProvider(): AgeEstimationProvider | null {
    const provider = process.env.CV_PROVIDER || 'gemini';

    switch (provider) {
        case 'gemini': {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.warn('⚠ GEMINI_API_KEY not set — CV assessment disabled');
                return null;
            }
            return createGeminiProvider(apiKey);
        }

        case 'none':
            return null;

        default:
            console.warn(`⚠ Unknown CV_PROVIDER: ${provider} — CV assessment disabled`);
            return null;
    }
}
