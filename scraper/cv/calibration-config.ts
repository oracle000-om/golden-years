/**
 * CV Calibration Config — Dynamic Pipeline Tuning
 *
 * Uses aggregate calibration metrics to dynamically adjust
 * the CV pipeline: confidence thresholds, prompt addenda,
 * and photo quality filtering.
 *
 * Designed to be called once per scraper run, not per-animal.
 */

import type { Confidence } from './types';

export interface CalibrationConfig {
    /** Minimum confidence to accept — results below this are rejected */
    minConfidence: Confidence;
    /** Additional prompt text injected before the main assessment prompt */
    promptAddendum: string | null;
    /** Whether to skip CV for photos flagged as "poor" quality */
    rejectPoorPhotos: boolean;
    /** Computed suggestions for admin review */
    suggestions: string[];
}

interface CalibrationData {
    confidenceDistribution: Record<string, number>;
    avgSpanByConfidence: Record<string, number>;
    photoQualityDistribution: Record<string, number>;
    conflictRate: number;
    totalCvAssessments: number;
}

/**
 * Compute a CalibrationConfig from aggregate assessment data.
 *
 * Rules:
 *   1. If >60% of results are HIGH confidence, raise floor to MEDIUM
 *   2. If avg age span for MEDIUM confidence is >5yr, add a precision prompt
 *   3. If >40% of photos are "poor" quality, enable poor-photo rejection
 *   4. If conflict rate >20%, add a cross-validation emphasis prompt
 */
export function computeCalibrationConfig(data: CalibrationData): CalibrationConfig {
    const suggestions: string[] = [];
    const promptParts: string[] = [];
    let minConfidence: Confidence = 'LOW';
    let rejectPoorPhotos = false;

    const total = data.totalCvAssessments;
    if (total === 0) {
        return { minConfidence: 'LOW', promptAddendum: null, rejectPoorPhotos: false, suggestions: ['No CV data yet — using defaults'] };
    }

    // Rule 1: High-confidence dominance → raise floor
    const highCount = data.confidenceDistribution['HIGH'] || 0;
    const highPct = (highCount / total) * 100;
    if (highPct > 60) {
        minConfidence = 'MEDIUM';
        suggestions.push(`${highPct.toFixed(0)}% HIGH confidence — raising minimum to MEDIUM`);
    }

    // Rule 2: Wide age spans → add precision prompt
    const mediumSpan = data.avgSpanByConfidence['MEDIUM'] || 0;
    if (mediumSpan > 5) {
        promptParts.push('PRECISION NOTE: Recent assessments show wide age ranges for MEDIUM confidence results. Please narrow your age estimate to within 3 years when possible. Be specific rather than hedging with wide ranges.');
        suggestions.push(`MEDIUM confidence avg span is ${mediumSpan.toFixed(1)}yr — adding precision prompt`);
    }

    // Rule 3: Poor photo prevalence → skip poor photos
    const poorCount = data.photoQualityDistribution['poor'] || 0;
    const poorPct = (poorCount / total) * 100;
    if (poorPct > 40) {
        rejectPoorPhotos = true;
        suggestions.push(`${poorPct.toFixed(0)}% poor-quality photos — enabling photo rejection`);
    }

    // Rule 4: High conflict rate → emphasize cross-validation
    if (data.conflictRate > 20) {
        promptParts.push('CONFLICT ALERT: Recent assessments show a high rate of discrepancies between CV findings and shelter data. Pay extra attention to cross-validation and report all discrepancies in dataConflicts.');
        suggestions.push(`Conflict rate is ${data.conflictRate.toFixed(1)}% — adding cross-validation emphasis`);
    }

    if (suggestions.length === 0) {
        suggestions.push('Pipeline metrics within normal range — no adjustments needed');
    }

    return {
        minConfidence,
        promptAddendum: promptParts.length > 0 ? promptParts.join('\n\n') : null,
        rejectPoorPhotos,
        suggestions,
    };
}
