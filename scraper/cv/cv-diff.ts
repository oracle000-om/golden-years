/**
 * CV Assessment Diff — Change Detection
 *
 * Compares a new CV assessment against an existing animal record
 * and produces a structured diff of what changed. Used for:
 *   1. Logging to snapshot rawAssessment for audit trail
 *   2. Console logging during scraper runs
 *   3. Future trend analysis
 */

import type { AnimalAssessment } from './types';

export interface AssessmentDiffEntry {
    field: string;
    old: string | number | null;
    new: string | number | null;
}

export interface AssessmentDiff {
    /** Whether any tracked fields changed */
    hasChanges: boolean;
    /** Individual field diffs */
    changes: AssessmentDiffEntry[];
    /** Human-readable summary for console logging */
    summary: string;
}

/** Fields we track for diffs — maps field name to display label */
const TRACKED_FIELDS: { key: string; label: string }[] = [
    { key: 'bodyConditionScore', label: 'BCS' },
    { key: 'coatCondition', label: 'coat' },
    { key: 'aggressionRisk', label: 'aggr' },
    { key: 'stressLevel', label: 'stress' },
    { key: 'estimatedCareLevel', label: 'care' },
    { key: 'photoQuality', label: 'photo' },
    { key: 'ageEstimatedLow', label: 'ageLow' },
    { key: 'ageEstimatedHigh', label: 'ageHigh' },
    { key: 'confidence', label: 'conf' },
];

/**
 * Compute a structured diff between a previous animal record and a new CV assessment.
 *
 * @param previous - The existing animal DB record (any object with CV fields)
 * @param current - The new CV assessment result
 * @returns Structured diff with change entries and summary string
 */
export function computeAssessmentDiff(
    previous: Record<string, unknown>,
    current: AnimalAssessment,
): AssessmentDiff {
    const changes: AssessmentDiffEntry[] = [];

    for (const { key, label } of TRACKED_FIELDS) {
        const oldVal = previous[key] ?? null;
        const newVal = (current as unknown as Record<string, unknown>)[key] ?? null;

        // Normalize for comparison
        const oldNorm = oldVal === undefined ? null : oldVal;
        const newNorm = newVal === undefined ? null : newVal;

        if (oldNorm !== newNorm) {
            changes.push({
                field: label,
                old: oldNorm as string | number | null,
                new: newNorm as string | number | null,
            });
        }
    }

    const hasChanges = changes.length > 0;
    const summary = hasChanges
        ? changes.map(c => `${c.field} ${c.old ?? '?'}→${c.new ?? '?'}`).join(', ')
        : 'no changes';

    return { hasChanges, changes, summary };
}
