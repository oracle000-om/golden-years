/**
 * CV Age Estimation — Types
 *
 * Provider-agnostic types for the age estimation pipeline.
 * Any model (Gemini, Llama Vision, self-hosted) implements
 * the AgeEstimationProvider interface.
 */

export type AgeConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface AgeEstimate {
    /** Detected species */
    species: 'DOG' | 'CAT' | 'OTHER';

    /** Lower bound of estimated age in years */
    estimatedAgeLow: number;

    /** Upper bound of estimated age in years */
    estimatedAgeHigh: number;

    /** Whether the animal is likely a senior (7+ years) */
    isSenior: boolean;

    /** Categorical confidence level */
    confidence: AgeConfidence;

    /** Visual indicators that informed the estimate */
    indicators: string[];

    /** CV-detected breed(s), most likely first */
    detectedBreeds: string[];

    /** Confidence in breed detection */
    breedConfidence: AgeConfidence;
}

/**
 * Provider interface — any vision model implements this.
 * Returns null if the image can't be assessed (bad photo, not an animal, etc.)
 */
export interface AgeEstimationProvider {
    estimateAge(photoUrl: string): Promise<AgeEstimate | null>;
}
