/**
 * CV Age Estimation — Provider Factory
 *
 * Entry point for the CV pipeline. Instantiates the configured
 * provider based on environment variable CV_PROVIDER.
 *
 * Default: gemini (Gemini 2.0 Flash)
 * Future: llama-vision, self-hosted, etc.
 */

import { createGeminiProvider } from './gemini-provider';
import type { AgeEstimationProvider } from './types';

export { estimateAgeFromText } from './text-fallback';
export { lookupLifeExpectancy } from './breed-lifespan';
export type { AgeEstimate, AgeConfidence, AgeEstimationProvider } from './types';
export type { LifeExpectancy } from './breed-lifespan';

/**
 * Create an age estimation provider based on configuration.
 * Returns null if no provider is configured (CV disabled).
 */
export function createAgeEstimationProvider(): AgeEstimationProvider | null {
    const provider = process.env.CV_PROVIDER || 'gemini';

    switch (provider) {
        case 'gemini': {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.warn('⚠ GEMINI_API_KEY not set — CV age estimation disabled');
                return null;
            }
            return createGeminiProvider(apiKey);
        }

        case 'none':
            return null;

        default:
            console.warn(`⚠ Unknown CV_PROVIDER: ${provider} — CV age estimation disabled`);
            return null;
    }
}
