/**
 * CV Animal Assessment — Types
 *
 * Provider-agnostic types for the AI assessment pipeline.
 * Any model (Gemini, Llama Vision, self-hosted) implements
 * the AssessmentProvider interface.
 *
 * v2: Expanded from age-only to comprehensive animal assessment
 * including health scoring, behavioral signals, and care needs.
 */

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface AnimalAssessment {
    // ── Age estimation (v1) ──
    /** Detected species */
    species: 'DOG' | 'CAT' | 'OTHER';
    /** Lower bound of estimated age in years */
    estimatedAgeLow: number;
    /** Upper bound of estimated age in years */
    estimatedAgeHigh: number;
    /** Whether the animal is likely a senior (7+ years) */
    isSenior: boolean;
    /** Categorical confidence level */
    confidence: Confidence;
    /** Visual indicators that informed the age estimate */
    indicators: string[];

    // ── Breed detection (v1) ──
    /** CV-detected breed(s), most likely first */
    detectedBreeds: string[];
    /** Confidence in breed detection */
    breedConfidence: Confidence;

    // ── Health assessment (v2) ──
    /** Body Condition Score on 1–9 veterinary scale (4–5 = ideal) */
    bodyConditionScore: number | null;
    /** Coat condition assessment */
    coatCondition: 'good' | 'fair' | 'poor' | null;
    /** Visible health conditions detected */
    visibleConditions: string[];
    /** Free-text health observations */
    healthNotes: string | null;

    // ── Behavioral signals (v2) ──
    /** Aggression risk score: 1 = no signs, 5 = clear aggression indicators */
    aggressionRisk: number;
    /** Fear-based behavioral indicators (distinct from aggression) */
    fearIndicators: string[];
    /** Overall stress level visible in photo */
    stressLevel: 'low' | 'moderate' | 'high' | null;
    /** Free-text behavioral observations */
    behaviorNotes: string | null;

    // ── Photo quality (v2) ──
    /** Listing photo quality assessment */
    photoQuality: 'good' | 'acceptable' | 'poor';

    // ── Veterinary care guidance (v2) ──
    /** Likely care needs based on breed, age, and visible conditions */
    likelyCareNeeds: string[];
    /** Estimated overall care level for adopter planning */
    estimatedCareLevel: 'low' | 'moderate' | 'high';

    // ── Cross-validation (v3) ──
    /** Discrepancies between CV findings and shelter-reported data */
    dataConflicts: string[];
}

/** Backward compatibility alias */
export type AgeEstimate = AnimalAssessment;

/**
 * Optional context from the shelter listing to improve CV accuracy.
 * Since Golden Years Club only lists seniors (full-grown animals),
 * shelter-reported size is a reliable signal for breed identification.
 */
export interface AssessmentContext {
    /** Shelter-reported size: SMALL, MEDIUM, LARGE, XLARGE */
    shelterSize?: string | null;
    /** Shelter-reported species */
    shelterSpecies?: string | null;
    /** Shelter-reported age in years */
    shelterAge?: number | null;
    /** Shelter-reported breed string */
    shelterBreed?: string | null;
    /** Listing notes / description from shelter */
    shelterNotes?: string | null;
}

/**
 * Provider interface — any vision model implements this.
 * Returns null if the image can't be assessed (bad photo, not an animal, etc.)
 */
export interface AssessmentProvider {
    assess(photoUrl: string, additionalPhotos?: string[], context?: AssessmentContext): Promise<AnimalAssessment | null>;
}

/** Backward compatibility alias */
export type AgeEstimationProvider = AssessmentProvider & {
    estimateAge(photoUrl: string, additionalPhotos?: string[], context?: AssessmentContext): Promise<AnimalAssessment | null>;
};
