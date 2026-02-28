/**
 * Breed Health Types — Shared type definitions for all BreedProfile JSON columns
 *
 * These interfaces govern the shape of the 11 Json? columns on BreedProfile
 * and the conditionJson column on VetArticle. Import these at both write
 * boundaries (adapters/runners) and read boundaries (queries/enrichments).
 *
 * Column → Type mapping:
 *   pubmedConditions      → PubmedCondition[]
 *   pubmedTreatments      → PubmedTreatment[]
 *   pubmedDrugSensitivities → PubmedDrugSensitivity[]
 *   pubmedNutrition       → PubmedNutrition[]
 *   pubmedBehavioral      → PubmedBehavioral[]
 *   pubmedMortality       → PubmedMortality[]
 *   pubmedDiagnostics     → PubmedDiagnostic[]
 *   fdaAdverseReactions   → FdaAdverseReaction[]
 *   fdaDrugWarnings       → FdaDrugWarning[]
 *   nationwideConditions  → InsurerCondition[]
 *   trupanionConditions   → InsurerCondition[]
 *   VetArticle.conditionJson → VetArticleCondition[]
 */

// ── PubMed (7 columns) ──────────────────────────────────

export interface PubmedCondition {
    condition: string;
    prevalence: 'common' | 'moderate' | 'rare';
    severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
    typicalAgeOnset: number | null;
    seniorRelevant: boolean;
    description: string;
    citationPmids: string[];
}

export interface PubmedTreatment {
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

export interface PubmedDrugSensitivity {
    drug: string;
    reaction: string;
    severity: 'mild' | 'moderate' | 'severe' | 'fatal';
    geneticBasis: string | null;
    citationPmids: string[];
}

export interface PubmedNutrition {
    recommendation: string;
    rationale: string;
    seniorSpecific: boolean;
    citationPmids: string[];
}

export interface PubmedBehavioral {
    trait: string;
    prevalence: 'common' | 'moderate' | 'rare';
    seniorOnset: boolean;
    managementTips: string | null;
    citationPmids: string[];
}

export interface PubmedMortality {
    condition: string;
    medianSurvivalYears: number | null;
    ageOfOnset: number | null;
    mortalityRate: string | null;
    citationPmids: string[];
}

export interface PubmedDiagnostic {
    test: string;
    forCondition: string;
    recommendedFrequency: string | null;
    seniorRelevant: boolean;
    citationPmids: string[];
}

// ── openFDA (2 columns) ─────────────────────────────────

export interface FdaAdverseReaction {
    reaction: string;
    count: number;
}

export interface FdaDrugWarning {
    drug: string;
    count: number;
}

// ── Insurance / Nationwide + Trupanion (2 columns, shared shape) ──

export interface InsurerCondition {
    condition: string;
    description: string;
    riskLevel: 'high' | 'moderate' | 'low';
    estimatedCostLow: number;
    estimatedCostHigh: number;
    claimFrequency: string;
    lifeStage: 'puppy' | 'adult' | 'senior' | 'all';
    prevention: string | null;
    treatmentType: 'surgery' | 'medication' | 'ongoing_management' | 'monitoring' | 'other';
}

// ── VetArticle.conditionJson ────────────────────────────

export interface VetArticleCondition {
    condition: string;
    prevalence: string | null;
    severity: string | null;
    ageOnset: number | null;
}

// ── Aggregate type for full BreedProfile enrichment data ──

export interface BreedHealthData {
    pubmedConditions: PubmedCondition[] | null;
    pubmedTreatments: PubmedTreatment[] | null;
    pubmedDrugSensitivities: PubmedDrugSensitivity[] | null;
    pubmedNutrition: PubmedNutrition[] | null;
    pubmedBehavioral: PubmedBehavioral[] | null;
    pubmedMortality: PubmedMortality[] | null;
    pubmedDiagnostics: PubmedDiagnostic[] | null;
    fdaAdverseReactions: FdaAdverseReaction[] | null;
    fdaDrugWarnings: FdaDrugWarning[] | null;
    nationwideConditions: InsurerCondition[] | null;
    trupanionConditions: InsurerCondition[] | null;
}
