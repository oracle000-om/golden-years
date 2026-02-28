/**
 * Insurance Breed Health Extractor — Gemini Provider
 *
 * Uses Gemini to generate structured insurance-grade breed health data
 * based on publicly available sources (Nationwide HealthZone, Trupanion
 * breed guides, AVMA data, veterinary literature).
 *
 * This replaces direct scraping of insurer websites (which block headless
 * browsers). Gemini's training data includes these public sources.
 *
 * Output: Nationwide-style conditions + Trupanion-style cost/frequency data
 */

import { GoogleGenAI, Type } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

// ── Types ──

import type { InsurerCondition } from '../types/breed-health';
export type { InsurerCondition } from '../types/breed-health';

export interface InsurerBreedData {
    breed: string;
    species: string;
    nationwideConditions: InsurerCondition[];
    trupanionConditions: InsurerCondition[];
    estimatedAnnualCostLow: number;    // total expected annual vet cost
    estimatedAnnualCostHigh: number;
    insuranceRecommendation: string;    // brief recommendation
}

// ── Gemini Schema ──

const INSURER_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        nationwideConditions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    condition: { type: Type.STRING },
                    description: { type: Type.STRING },
                    riskLevel: { type: Type.STRING, enum: ['high', 'moderate', 'low'] },
                    estimatedCostLow: { type: Type.NUMBER },
                    estimatedCostHigh: { type: Type.NUMBER },
                    claimFrequency: { type: Type.STRING },
                    lifeStage: { type: Type.STRING, enum: ['puppy', 'adult', 'senior', 'all'] },
                    prevention: { type: Type.STRING, nullable: true },
                    treatmentType: { type: Type.STRING, enum: ['surgery', 'medication', 'ongoing_management', 'monitoring', 'other'] },
                },
                required: ['condition', 'description', 'riskLevel', 'estimatedCostLow', 'estimatedCostHigh', 'claimFrequency', 'lifeStage', 'treatmentType'],
            },
        },
        trupanionConditions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    condition: { type: Type.STRING },
                    description: { type: Type.STRING },
                    riskLevel: { type: Type.STRING, enum: ['high', 'moderate', 'low'] },
                    estimatedCostLow: { type: Type.NUMBER },
                    estimatedCostHigh: { type: Type.NUMBER },
                    claimFrequency: { type: Type.STRING },
                    lifeStage: { type: Type.STRING, enum: ['puppy', 'adult', 'senior', 'all'] },
                    prevention: { type: Type.STRING, nullable: true },
                    treatmentType: { type: Type.STRING, enum: ['surgery', 'medication', 'ongoing_management', 'monitoring', 'other'] },
                },
                required: ['condition', 'description', 'riskLevel', 'estimatedCostLow', 'estimatedCostHigh', 'claimFrequency', 'lifeStage', 'treatmentType'],
            },
        },
        estimatedAnnualCostLow: { type: Type.NUMBER },
        estimatedAnnualCostHigh: { type: Type.NUMBER },
        insuranceRecommendation: { type: Type.STRING },
    },
    required: ['nationwideConditions', 'trupanionConditions', 'estimatedAnnualCostLow', 'estimatedAnnualCostHigh', 'insuranceRecommendation'],
};

// ── Prompt ──

function buildInsurerPrompt(breed: string, species: string): string {
    return `You are a veterinary insurance data analyst with expertise in pet health insurance claims data.

TASK: Generate comprehensive insurance-grade health condition data for the ${breed} (${species.toLowerCase()}) breed, structured as if sourced from major pet insurance providers.

Use your knowledge of:
- Nationwide Pet Insurance HealthZone breed profiles
- Trupanion breed condition guides and claim data
- AVMA veterinary expenditure surveys
- Published veterinary literature on breed-specific conditions

Generate TWO sets of conditions:

## nationwideConditions
From the perspective of Nationwide's Pet HealthZone — focus on:
- Common breed-specific health concerns
- Estimated treatment cost ranges in USD
- Prevention and early detection tips
- Risk levels based on breed predisposition data

## trupanionConditions
From the perspective of Trupanion's claim data — focus on:
- Conditions most commonly claimed for this breed
- Cost ranges based on actual insurance claim payouts
- Life stage breakdown (puppy/adult/senior)
- Claim frequency relative to average pet (e.g., "2.1x average")

RULES:
- Include 5-10 conditions per source for well-known breeds, 3-5 for rare breeds.
- Cost estimates should reflect real-world US veterinary pricing (2024-2025 data).
- Be specific to this breed — don't include generic conditions unless they have notably higher incidence.
- For ${species === 'DOG' ? 'dogs' : 'cats'}, account for breed size and typical weight.
- estimatedAnnualCostLow/High should reflect the total expected annual veterinary expenditure for this breed, considering preventive care + likely condition management.
- insuranceRecommendation: a 1-2 sentence recommendation about pet insurance for this specific breed.
- prevention: actionable prevention tips (e.g., "Regular hip screening after age 2", "Weight management"), null if none applicable.
- Differentiate between nationwideConditions (comprehensive health overview) and trupanionConditions (claims-focused, with frequency data).`;
}

// ── Extractor ──

export function createInsurerExtractor(apiKey: string) {
    const ai = new GoogleGenAI({ apiKey });

    async function extractInsurerData(breed: string, species: string): Promise<InsurerBreedData> {
        const prompt = buildInsurerPrompt(breed, species);

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: INSURER_SCHEMA,
                temperature: 0.2,
            },
        });

        const text = response.text;
        if (!text) {
            return {
                breed, species,
                nationwideConditions: [],
                trupanionConditions: [],
                estimatedAnnualCostLow: 0,
                estimatedAnnualCostHigh: 0,
                insuranceRecommendation: '',
            };
        }

        const parsed = JSON.parse(text);
        return {
            breed,
            species,
            nationwideConditions: parsed.nationwideConditions || [],
            trupanionConditions: parsed.trupanionConditions || [],
            estimatedAnnualCostLow: parsed.estimatedAnnualCostLow || 0,
            estimatedAnnualCostHigh: parsed.estimatedAnnualCostHigh || 0,
            insuranceRecommendation: parsed.insuranceRecommendation || '',
        };
    }

    return { extractInsurerData };
}
