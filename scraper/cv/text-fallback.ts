/**
 * CV Age Estimation — Text Fallback
 *
 * For animals with no photo, parses shelter notes and descriptions
 * for age signals. Critical for rural shelters that often don't
 * photograph animals.
 *
 * Returns LOW confidence since text-only signals are less reliable
 * than visual analysis, but still surfaces the animal for review.
 */

import type { AgeEstimate } from './types';

/** Keywords/phrases that indicate a senior animal */
const SENIOR_KEYWORDS = [
    'senior', 'elderly', 'geriatric', 'older', 'aged',
    'grey muzzle', 'gray muzzle', 'white muzzle',
    'arthritic', 'arthritis', 'stiff joints',
    'cloudy eyes', 'cataracts', 'blind', 'vision loss',
    'dental disease', 'missing teeth', 'tooth loss',
    'lumps', 'tumors', 'growths',
    'hard of hearing', 'deaf',
    'low energy', 'slow moving',
];

/** Regex patterns that capture explicit age mentions */
const AGE_PATTERNS = [
    // "10 year old", "10-year-old", "10 yr old", "10yr"
    /(\d{1,2})\s*[-–]?\s*(?:year|yr)s?\s*[-–]?\s*old/i,
    // "approx 12 yrs", "approximately 10 years"
    /approx(?:imately)?\s*(\d{1,2})\s*(?:year|yr)s?/i,
    // "age: 10", "age 10"
    /age[:\s]+(\d{1,2})/i,
    // "about 10 years"
    /about\s+(\d{1,2})\s*(?:year|yr)s?/i,
    // "est. 10 years"
    /est\.?\s*(\d{1,2})\s*(?:year|yr)s?/i,
];

const SENIOR_AGE_THRESHOLD = 7;

/**
 * Attempt to estimate age from text notes/description.
 * Returns null if no age signals are found.
 */
export function estimateAgeFromText(
    notes: string | null,
    species: 'DOG' | 'CAT' | 'OTHER' = 'DOG',
): AgeEstimate | null {
    if (!notes || notes.trim().length === 0) return null;

    const lower = notes.toLowerCase();

    // First, try to extract an explicit age mention
    for (const pattern of AGE_PATTERNS) {
        const match = notes.match(pattern);
        if (match) {
            const age = parseInt(match[1], 10);
            if (age >= SENIOR_AGE_THRESHOLD && age <= 25) {
                // Collect any additional indicators from the text
                const indicators = findIndicators(lower);
                indicators.unshift('age mentioned in notes');

                return {
                    species,
                    estimatedAgeLow: Math.max(SENIOR_AGE_THRESHOLD, age - 1),
                    estimatedAgeHigh: age + 2,
                    isSenior: true,
                    confidence: 'LOW',
                    indicators,
                    detectedBreeds: [],
                    breedConfidence: 'NONE',
                };
            }
        }
    }

    // No explicit age — look for senior keywords
    const indicators = findIndicators(lower);

    if (indicators.length >= 2) {
        // Multiple indicators suggest senior
        return {
            species,
            estimatedAgeLow: 7,
            estimatedAgeHigh: 12,
            isSenior: true,
            confidence: 'LOW',
            indicators,
            detectedBreeds: [],
            breedConfidence: 'NONE',
        };
    }

    if (indicators.length === 1) {
        // Single indicator — very low confidence, but still flag it
        return {
            species,
            estimatedAgeLow: 7,
            estimatedAgeHigh: 15,
            isSenior: true,
            confidence: 'LOW',
            indicators,
            detectedBreeds: [],
            breedConfidence: 'NONE',
        };
    }

    return null;
}

/**
 * Find matching senior indicators in text
 */
function findIndicators(text: string): string[] {
    return SENIOR_KEYWORDS.filter(keyword => text.includes(keyword));
}
