/**
 * PubMed Comprehensive Extractor — Gemini Provider
 *
 * Extracts ALL available structured data from PubMed abstracts:
 *   - Health conditions (with prevalence, severity, age onset)
 *   - Treatment protocols (per condition)
 *   - Drug sensitivities / contraindications
 *   - Nutritional recommendations
 *   - Behavioral predispositions
 *   - Mortality / survival data
 *   - Recommended diagnostics
 *
 * Uses a single comprehensive prompt per batch to minimize API calls.
 * Batches abstracts into groups of 25 to avoid token limit issues.
 */

import { GoogleGenAI, Type } from '@google/genai';

const MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = 25;

// ── Types ──

export interface ExtractedCondition {
    condition: string;
    prevalence: 'common' | 'moderate' | 'rare';
    severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
    typicalAgeOnset: number | null;
    seniorRelevant: boolean;
    description: string;
    citationPmids: string[];
}

export interface ExtractedTreatment {
    condition: string;
    treatments: {
        name: string;
        type: 'surgery' | 'medication' | 'therapy' | 'management' | 'diet' | 'other';
        successRate: string | null;
        estimatedCostUsd: number | null;
        notes: string | null;
    }[];
    citationPmids: string[];
}

export interface ExtractedDrugSensitivity {
    drug: string;
    reaction: string;
    severity: 'mild' | 'moderate' | 'severe' | 'fatal';
    geneticBasis: string | null;
    citationPmids: string[];
}

export interface ExtractedNutrition {
    recommendation: string;
    rationale: string;
    seniorSpecific: boolean;
    citationPmids: string[];
}

export interface ExtractedBehavioral {
    trait: string;
    prevalence: 'common' | 'moderate' | 'rare';
    seniorOnset: boolean;
    managementTips: string | null;
    citationPmids: string[];
}

export interface ExtractedMortality {
    condition: string;
    medianSurvivalYears: number | null;
    ageOfOnset: number | null;
    mortalityRate: string | null;
    citationPmids: string[];
}

export interface ExtractedDiagnostic {
    test: string;
    forCondition: string;
    recommendedFrequency: string | null;
    seniorRelevant: boolean;
    citationPmids: string[];
}

export interface ComprehensiveExtractionResult {
    breed: string;
    species: 'DOG' | 'CAT';
    conditions: ExtractedCondition[];
    treatments: ExtractedTreatment[];
    drugSensitivities: ExtractedDrugSensitivity[];
    nutrition: ExtractedNutrition[];
    behavioral: ExtractedBehavioral[];
    mortality: ExtractedMortality[];
    diagnostics: ExtractedDiagnostic[];
    totalArticlesAnalyzed: number;
}

// ── Gemini Schema ──

const COMPREHENSIVE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        conditions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    condition: { type: Type.STRING },
                    prevalence: { type: Type.STRING, enum: ['common', 'moderate', 'rare'] },
                    severity: { type: Type.STRING, enum: ['mild', 'moderate', 'severe', 'life-threatening'] },
                    typicalAgeOnset: { type: Type.NUMBER, nullable: true },
                    seniorRelevant: { type: Type.BOOLEAN },
                    description: { type: Type.STRING },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['condition', 'prevalence', 'severity', 'seniorRelevant', 'description', 'citationPmids'],
            },
        },
        treatments: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    condition: { type: Type.STRING },
                    treatments: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                type: { type: Type.STRING, enum: ['surgery', 'medication', 'therapy', 'management', 'diet', 'other'] },
                                successRate: { type: Type.STRING, nullable: true },
                                estimatedCostUsd: { type: Type.NUMBER, nullable: true },
                                notes: { type: Type.STRING, nullable: true },
                            },
                            required: ['name', 'type'],
                        },
                    },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['condition', 'treatments', 'citationPmids'],
            },
        },
        drugSensitivities: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    drug: { type: Type.STRING },
                    reaction: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ['mild', 'moderate', 'severe', 'fatal'] },
                    geneticBasis: { type: Type.STRING, nullable: true },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['drug', 'reaction', 'severity', 'citationPmids'],
            },
        },
        nutrition: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    recommendation: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    seniorSpecific: { type: Type.BOOLEAN },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['recommendation', 'rationale', 'seniorSpecific', 'citationPmids'],
            },
        },
        behavioral: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    trait: { type: Type.STRING },
                    prevalence: { type: Type.STRING, enum: ['common', 'moderate', 'rare'] },
                    seniorOnset: { type: Type.BOOLEAN },
                    managementTips: { type: Type.STRING, nullable: true },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['trait', 'prevalence', 'seniorOnset', 'citationPmids'],
            },
        },
        mortality: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    condition: { type: Type.STRING },
                    medianSurvivalYears: { type: Type.NUMBER, nullable: true },
                    ageOfOnset: { type: Type.NUMBER, nullable: true },
                    mortalityRate: { type: Type.STRING, nullable: true },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['condition', 'citationPmids'],
            },
        },
        diagnostics: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    test: { type: Type.STRING },
                    forCondition: { type: Type.STRING },
                    recommendedFrequency: { type: Type.STRING, nullable: true },
                    seniorRelevant: { type: Type.BOOLEAN },
                    citationPmids: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['test', 'forCondition', 'seniorRelevant', 'citationPmids'],
            },
        },
    },
    required: ['conditions', 'treatments', 'drugSensitivities', 'nutrition', 'behavioral', 'mortality', 'diagnostics'],
};

// ── Prompt ──

function buildComprehensivePrompt(
    breed: string,
    species: string,
    abstracts: { pmid: string; title: string; abstract: string }[],
): string {
    const abstractText = abstracts
        .map(a => `[PMID:${a.pmid}] ${a.title}\n${a.abstract}`)
        .join('\n\n---\n\n');

    return `You are a veterinary medicine specialist analyzing peer-reviewed research literature.

TASK: Extract ALL available health-related data for the ${breed} (${species.toLowerCase()}) breed from the following PubMed abstracts. Be comprehensive — extract every structured data point available.

EXTRACT THE FOLLOWING CATEGORIES:

## 1. CONDITIONS
Health conditions/diseases with breed predisposition.
- prevalence: common (>20% or well-known), moderate (5-20%), rare (<5% but breed-specific)
- severity: mild, moderate, severe, life-threatening
- typicalAgeOnset: in years, null if unknown
- seniorRelevant: true if worsens with age or primarily affects older animals
- description: 1-2 sentences, clinically accurate

## 2. TREATMENTS
Treatment protocols mentioned for breed-specific conditions.
- Link each treatment to its condition
- type: surgery, medication, therapy, management, diet, other
- successRate: quote from paper if available (e.g., "85% remission rate"), null if not stated
- estimatedCostUsd: approximate if discussed, null otherwise
- notes: dosage, duration, or other specifics mentioned

## 3. DRUG SENSITIVITIES
Breed-specific drug reactions, contraindications, or pharmacogenomic data.
- drug: medication name
- reaction: what happens (e.g., "neurotoxicity", "prolonged sedation")
- severity: mild, moderate, severe, fatal
- geneticBasis: gene mutation if mentioned (e.g., "MDR1 mutation"), null otherwise

## 4. NUTRITION
Diet and nutritional recommendations specific to this breed.
- recommendation: specific dietary guidance
- rationale: why this is breed-specific
- seniorSpecific: true if specifically for older animals

## 5. BEHAVIORAL
Breed-specific behavioral traits, predispositions, or issues from research.
- trait: behavioral characteristic (e.g., "separation anxiety", "cognitive dysfunction")
- prevalence: common, moderate, rare
- seniorOnset: true if typically develops in older age
- managementTips: brief tips if mentioned

## 6. MORTALITY
Survival/mortality data, life expectancy modifiers, cause of death statistics.
- condition: what causes mortality
- medianSurvivalYears: survival time after diagnosis, null if not stated
- ageOfOnset: typical age in years, null if not stated
- mortalityRate: percentage or description if available, null otherwise

## 7. DIAGNOSTICS
Recommended tests, screening protocols, diagnostic procedures.
- test: name of diagnostic test
- forCondition: what condition it screens for
- recommendedFrequency: how often (e.g., "annually after age 7"), null if not stated
- seniorRelevant: true if particularly important for older animals

RULES:
- Only include data specifically linked to this breed, not generic ${species === 'DOG' ? 'canine' : 'feline'} data.
- If multiple articles discuss the same item, merge and cite all relevant PMIDs.
- Only cite PMIDs that actually contain the information you're extracting.
- If a category has no breed-specific data in these abstracts, return an empty array for it.
- Be thorough — extract everything available, even minor mentions.

ARTICLES:

${abstractText}`;
}

// ── Extractor ──

export function createConditionExtractor(apiKey: string) {
    const ai = new GoogleGenAI({ apiKey });

    async function extractBatch(
        breed: string,
        species: 'DOG' | 'CAT',
        abstracts: { pmid: string; title: string; abstract: string }[],
    ): Promise<Omit<ComprehensiveExtractionResult, 'breed' | 'species' | 'totalArticlesAnalyzed'>> {
        const prompt = buildComprehensivePrompt(breed, species, abstracts);
        const validPmids = new Set(abstracts.map(a => a.pmid));

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: COMPREHENSIVE_SCHEMA,
                temperature: 0.1,
            },
        });

        const text = response.text;
        if (!text) {
            return { conditions: [], treatments: [], drugSensitivities: [], nutrition: [], behavioral: [], mortality: [], diagnostics: [] };
        }

        const parsed = JSON.parse(text);

        // Validate PMIDs across all categories
        const filterPmids = <T extends { citationPmids: string[] }>(items: T[]): T[] =>
            (items || []).map(item => ({ ...item, citationPmids: item.citationPmids.filter(p => validPmids.has(p)) }));

        return {
            conditions: filterPmids(parsed.conditions || []),
            treatments: filterPmids(parsed.treatments || []),
            drugSensitivities: filterPmids(parsed.drugSensitivities || []),
            nutrition: filterPmids(parsed.nutrition || []),
            behavioral: filterPmids(parsed.behavioral || []),
            mortality: filterPmids(parsed.mortality || []),
            diagnostics: filterPmids(parsed.diagnostics || []),
        };
    }

    async function extractConditions(
        breed: string,
        species: 'DOG' | 'CAT',
        articles: { pmid: string; title: string; abstract: string | null }[],
    ): Promise<ComprehensiveExtractionResult> {
        const withAbstracts = articles.filter(
            (a): a is { pmid: string; title: string; abstract: string } => !!a.abstract,
        );

        const empty: ComprehensiveExtractionResult = {
            breed, species, totalArticlesAnalyzed: 0,
            conditions: [], treatments: [], drugSensitivities: [],
            nutrition: [], behavioral: [], mortality: [], diagnostics: [],
        };

        if (withAbstracts.length === 0) return empty;

        // Process in batches
        const allResults: Omit<ComprehensiveExtractionResult, 'breed' | 'species' | 'totalArticlesAnalyzed'>[] = [];

        for (let i = 0; i < withAbstracts.length; i += BATCH_SIZE) {
            const batch = withAbstracts.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(withAbstracts.length / BATCH_SIZE);

            try {
                const result = await extractBatch(breed, species, batch);
                allResults.push(result);

                const totalItems = result.conditions.length + result.treatments.length +
                    result.drugSensitivities.length + result.nutrition.length +
                    result.behavioral.length + result.mortality.length + result.diagnostics.length;

                if (totalBatches > 1) {
                    console.log(`      📊 Batch ${batchNum}/${totalBatches}: ${totalItems} items (${result.conditions.length}C ${result.treatments.length}T ${result.drugSensitivities.length}D ${result.nutrition.length}N ${result.behavioral.length}B ${result.mortality.length}M ${result.diagnostics.length}Dx)`);
                }
            } catch (err) {
                console.error(`      ⚠ Batch ${batchNum}/${totalBatches} failed: ${(err as Error).message?.substring(0, 80)}`);
            }
        }

        // Merge across batches
        return {
            breed,
            species,
            totalArticlesAnalyzed: withAbstracts.length,
            conditions: mergeByKey(allResults.flatMap(r => r.conditions), c => c.condition),
            treatments: mergeByKey(allResults.flatMap(r => r.treatments), t => t.condition),
            drugSensitivities: mergeByKey(allResults.flatMap(r => r.drugSensitivities), d => d.drug),
            nutrition: mergeByKey(allResults.flatMap(r => r.nutrition), n => n.recommendation),
            behavioral: mergeByKey(allResults.flatMap(r => r.behavioral), b => b.trait),
            mortality: mergeByKey(allResults.flatMap(r => r.mortality), m => m.condition),
            diagnostics: mergeByKey(allResults.flatMap(r => r.diagnostics), d => d.test + ':' + d.forCondition),
        };
    }

    return { extractConditions };
}

/**
 * Generic merge-by-key that deduplicates by a key function,
 * merging citationPmids across duplicates.
 */
function mergeByKey<T extends { citationPmids: string[] }>(
    items: T[],
    keyFn: (item: T) => string,
): T[] {
    const byKey = new Map<string, T>();

    for (const item of items) {
        const key = keyFn(item).toLowerCase().trim();
        const existing = byKey.get(key);

        if (!existing) {
            byKey.set(key, { ...item });
        } else {
            // Merge PMIDs
            const mergedPmids = new Set([...existing.citationPmids, ...item.citationPmids]);
            existing.citationPmids = [...mergedPmids];
        }
    }

    return [...byKey.values()];
}
