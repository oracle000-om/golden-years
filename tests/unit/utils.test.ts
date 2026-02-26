/**
 * Unit Tests — Utility Functions
 *
 * Tests pure business logic from utils.ts without touching
 * the browser or database.
 */
import { describe, test, expect } from 'vitest';
import {
    formatAge,
    getSaveRate,
    getBestAge,
    computeHealthScore,
    cleanDisplayText,
    formatYearsRemaining,
    getAvgBodyCondition,
    getDentalDiseaseRate,
    getCataractRate,
    getCareLevelDistribution,
    getYearsRemainingBuckets,
    getLongestStay,
    getReentryCount,
} from '@/lib/utils';

// ────────────────────────────────────────────
// formatAge
// ────────────────────────────────────────────
describe('formatAge', () => {
    test('shelter-reported age shows simple years', () => {
        expect(formatAge(10, null, null, 'NONE', 'SHELTER_REPORTED')).toBe('10 yrs');
    });

    test('singular year', () => {
        expect(formatAge(1, null, null, 'NONE', 'SHELTER_REPORTED')).toBe('1 yr');
    });

    test('CV estimated with high confidence shows range', () => {
        expect(formatAge(null, 8, 12, 'HIGH', 'CV_ESTIMATED')).toBe('8–12 yrs');
    });

    test('CV estimated with medium confidence shows "likely senior"', () => {
        expect(formatAge(null, 9, 13, 'MEDIUM', 'CV_ESTIMATED')).toBe('Likely senior · 9–13 yrs');
    });

    test('CV estimated with low confidence shows uncertain', () => {
        expect(formatAge(null, 7, 14, 'LOW', 'CV_ESTIMATED')).toBe('Possibly senior · age uncertain');
    });

    test('no data returns age unknown', () => {
        expect(formatAge(null, null, null, 'NONE', 'UNKNOWN')).toBe('Age unknown');
    });
});

// ────────────────────────────────────────────
// getSaveRate
// ────────────────────────────────────────────
describe('getSaveRate', () => {
    test('calculates percentage correctly', () => {
        expect(getSaveRate(1000, 100)).toBe(90);
    });

    test('zero intake returns null', () => {
        expect(getSaveRate(0, 0)).toBeNull();
    });

    test('zero euthanized = 100%', () => {
        expect(getSaveRate(500, 0)).toBe(100);
    });

    test('all euthanized = 0%', () => {
        expect(getSaveRate(100, 100)).toBe(0);
    });

    test('rounds to one decimal', () => {
        // (200 - 33) / 200 = 0.835 → 83.5%
        expect(getSaveRate(200, 33)).toBe(83.5);
    });
});

// ────────────────────────────────────────────
// getBestAge
// ────────────────────────────────────────────
describe('getBestAge', () => {
    test('prefers known age over CV', () => {
        const result = getBestAge(10, 8, 12, 'SHELTER_REPORTED');
        expect(result).toEqual({ age: 10, source: 'shelter' });
    });

    test('known age wins regardless of ageSource', () => {
        // Even with CV_ESTIMATED source, knownYears takes priority
        const result = getBestAge(10, 8, 12, 'CV_ESTIMATED');
        expect(result).toEqual({ age: 10, source: 'shelter' });
    });

    test('falls back to CV midpoint when no known age', () => {
        const result = getBestAge(null, 8, 12, 'CV_ESTIMATED');
        expect(result).toEqual({ age: 10, source: 'estimated' });
    });

    test('returns null when no age data', () => {
        expect(getBestAge(null, null, null, 'UNKNOWN')).toBeNull();
    });
});

// ────────────────────────────────────────────
// computeHealthScore
// ────────────────────────────────────────────
describe('computeHealthScore', () => {
    test('returns null when no data provided', () => {
        expect(computeHealthScore(null, null, [], null, [], null)).toBeNull();
    });

    test('ideal BCS (4-5) scores higher than extreme BCS (1 or 9)', () => {
        const ideal = computeHealthScore(5, 'good', [], 'relaxed', [], 'low');
        const extreme = computeHealthScore(1, 'poor', [], 'stressed', [], 'high');
        expect(ideal).not.toBeNull();
        expect(extreme).not.toBeNull();
        expect(ideal!.score).toBeGreaterThan(extreme!.score);
    });

    test('good coat scores higher than poor coat', () => {
        const good = computeHealthScore(5, 'good', [], null, [], null);
        const poor = computeHealthScore(5, 'poor', [], null, [], null);
        expect(good!.score).toBeGreaterThan(poor!.score);
    });

    test('visible conditions reduce the score', () => {
        const clean = computeHealthScore(5, 'good', [], null, [], null);
        const flagged = computeHealthScore(5, 'good', ['skin lesion', 'limping'], null, [], null);
        expect(clean!.score).toBeGreaterThan(flagged!.score);
    });

    test('score is between 0 and 100', () => {
        const result = computeHealthScore(5, 'good', [], 'relaxed', [], 'low');
        expect(result!.score).toBeGreaterThanOrEqual(0);
        expect(result!.score).toBeLessThanOrEqual(100);
    });

    test('has sub-score breakdown', () => {
        const result = computeHealthScore(5, 'good', [], 'relaxed', [], 'low');
        expect(result).toHaveProperty('subScores.physical');
        expect(result).toHaveProperty('subScores.medical');
        expect(result).toHaveProperty('subScores.comfort');
    });
});

// ────────────────────────────────────────────
// cleanDisplayText
// ────────────────────────────────────────────
describe('cleanDisplayText', () => {
    test('returns null for null input', () => {
        expect(cleanDisplayText(null)).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(cleanDisplayText('')).toBeNull();
    });

    test('decodes HTML entities', () => {
        expect(cleanDisplayText('Hello &amp; world')).toBe('Hello & world');
    });

    test('strips HTML tags', () => {
        expect(cleanDisplayText('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    test('collapses whitespace', () => {
        expect(cleanDisplayText('too   many    spaces')).toBe('too many spaces');
    });

    test('converts line break tags to newlines', () => {
        const result = cleanDisplayText('line one<br>line two');
        expect(result).toContain('\n');
    });

    test('decodes numeric HTML entities', () => {
        expect(cleanDisplayText('&#226;')).toBe('â');
    });
});

// ────────────────────────────────────────────
// Report Card Helpers
// ────────────────────────────────────────────
describe('getAvgBodyCondition', () => {
    test('averages BCS values', () => {
        expect(getAvgBodyCondition([
            { bodyConditionScore: 4 },
            { bodyConditionScore: 6 },
            { bodyConditionScore: 5 },
        ])).toBe(5);
    });

    test('ignores nulls', () => {
        expect(getAvgBodyCondition([
            { bodyConditionScore: 4 },
            { bodyConditionScore: null },
        ])).toBe(4);
    });

    test('returns null for empty array', () => {
        expect(getAvgBodyCondition([])).toBeNull();
    });

    test('returns null when all null', () => {
        expect(getAvgBodyCondition([{ bodyConditionScore: null }])).toBeNull();
    });
});

describe('getDentalDiseaseRate', () => {
    test('counts grade 2+ as diseased', () => {
        const result = getDentalDiseaseRate([
            { dentalGrade: 1 },
            { dentalGrade: 2 },
            { dentalGrade: 3 },
        ]);
        expect(result).toEqual({ count: 2, total: 3, pct: 67 });
    });

    test('returns null for empty array', () => {
        expect(getDentalDiseaseRate([])).toBeNull();
    });

    test('returns null when all null', () => {
        expect(getDentalDiseaseRate([{ dentalGrade: null }])).toBeNull();
    });
});

describe('getCataractRate', () => {
    test('counts non-none stages', () => {
        const result = getCataractRate([
            { cataractStage: 'none' },
            { cataractStage: 'early' },
            { cataractStage: 'mature' },
        ]);
        expect(result).toEqual({ count: 2, total: 3, pct: 67 });
    });

    test('returns null for no data', () => {
        expect(getCataractRate([])).toBeNull();
        expect(getCataractRate([{ cataractStage: null }])).toBeNull();
    });
});

describe('getCareLevelDistribution', () => {
    test('counts each level', () => {
        const result = getCareLevelDistribution([
            { estimatedCareLevel: 'low' },
            { estimatedCareLevel: 'low' },
            { estimatedCareLevel: 'moderate' },
            { estimatedCareLevel: 'high' },
        ]);
        expect(result).toEqual({ low: 2, moderate: 1, high: 1, total: 4 });
    });

    test('ignores null/unknown values', () => {
        const result = getCareLevelDistribution([
            { estimatedCareLevel: 'low' },
            { estimatedCareLevel: null },
        ]);
        expect(result).toEqual({ low: 1, moderate: 0, high: 0, total: 1 });
    });
});

describe('getYearsRemainingBuckets', () => {
    test('buckets animals by years remaining', () => {
        const result = getYearsRemainingBuckets([
            { ageKnownYears: 14, ageEstimatedLow: null, ageEstimatedHigh: null, lifeExpectancyLow: 12, lifeExpectancyHigh: 14 }, // 0 remaining
            { ageKnownYears: 13, ageEstimatedLow: null, ageEstimatedHigh: null, lifeExpectancyLow: 12, lifeExpectancyHigh: 14.5 }, // 1.5 remaining
            { ageKnownYears: 10, ageEstimatedLow: null, ageEstimatedHigh: null, lifeExpectancyLow: 12, lifeExpectancyHigh: 14 }, // 4 remaining
        ]);
        expect(result).toEqual({ under1: 1, oneToTwo: 1, twoToFour: 0, fourPlus: 1, total: 3 });
    });

    test('returns null when no animals have data', () => {
        expect(getYearsRemainingBuckets([
            { ageKnownYears: null, ageEstimatedLow: null, ageEstimatedHigh: null, lifeExpectancyLow: null, lifeExpectancyHigh: null },
        ])).toBeNull();
    });
});

describe('getLongestStay', () => {
    test('returns max days from intakeDate', () => {
        const now = new Date();
        const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
        const result = getLongestStay([
            { intakeDate: daysAgo(10) },
            { intakeDate: daysAgo(30) },
            { intakeDate: daysAgo(5) },
        ]);
        expect(result).toBe(30);
    });

    test('returns null when all null', () => {
        expect(getLongestStay([{ intakeDate: null }])).toBeNull();
    });
});

describe('getReentryCount', () => {
    test('counts entries > 1', () => {
        expect(getReentryCount([
            { shelterEntryCount: 1 },
            { shelterEntryCount: 2 },
            { shelterEntryCount: 3 },
        ])).toBe(2);
    });

    test('returns 0 when no re-entries', () => {
        expect(getReentryCount([
            { shelterEntryCount: 1 },
        ])).toBe(0);
    });
});
