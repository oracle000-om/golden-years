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
    test('prefers shelter-reported age', () => {
        const result = getBestAge(10, 8, 12, 'SHELTER_REPORTED');
        expect(result).toEqual({ age: 10, source: 'shelter' });
    });

    test('falls back to CV midpoint', () => {
        const result = getBestAge(null, 8, 12, 'CV_ESTIMATED');
        expect(result).toEqual({ age: 10, source: 'estimated' });
    });

    test('uses known years if age source is not shelter-reported but value exists', () => {
        const result = getBestAge(9, null, null, 'UNKNOWN');
        expect(result).toEqual({ age: 9, source: 'shelter' });
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
