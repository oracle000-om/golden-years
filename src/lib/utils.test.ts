/**
 * Tests for utils.ts — utility functions.
 *
 * Run: npx tsx --test src/lib/utils.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hoursUntil, getUrgencyLevel, formatAge, formatYearsRemaining, getAgeDiscrepancy, computeHealthScore, getSaveRate } from './utils';

describe('hoursUntil', () => {
    it('returns null for null input', () => {
        assert.strictEqual(hoursUntil(null), null);
    });

    it('returns positive hours for future date', () => {
        const future = new Date(Date.now() + 5 * 60 * 60 * 1000);
        const hours = hoursUntil(future);
        assert.ok(hours !== null && hours > 0, `Expected positive hours, got ${hours}`);
        assert.ok(hours! >= 4 && hours! <= 6, `Expected ~5 hours, got ${hours}`);
    });

    it('returns 0 for past date', () => {
        const past = new Date(Date.now() - 5 * 60 * 60 * 1000);
        assert.strictEqual(hoursUntil(past), 0);
    });
});

describe('getUrgencyLevel', () => {
    it('returns "standard" for null hours', () => {
        assert.strictEqual(getUrgencyLevel(null), 'standard');
    });

    it('returns "critical" for < 24 hours', () => {
        assert.strictEqual(getUrgencyLevel(12), 'critical');
    });

    it('returns "urgent" for 24-48 hours', () => {
        assert.strictEqual(getUrgencyLevel(36), 'urgent');
    });

    it('returns "warning" for 48-72 hours', () => {
        assert.strictEqual(getUrgencyLevel(60), 'warning');
    });

    it('returns "standard" for > 72 hours', () => {
        assert.strictEqual(getUrgencyLevel(100), 'standard');
    });
});

describe('formatAge', () => {
    it('formats known age', () => {
        const result = formatAge(10, null, null, 'NONE', 'SHELTER_REPORTED');
        assert.ok(result.includes('10'), `Expected age "10" in "${result}"`);
    });

    it('formats CV estimate range', () => {
        const result = formatAge(null, 8, 12, 'HIGH', 'CV_ESTIMATED');
        assert.ok(result.includes('8') && result.includes('12'), `Expected range in "${result}"`);
    });

    it('returns fallback for no data', () => {
        const result = formatAge(null, null, null, 'NONE', 'UNKNOWN');
        assert.ok(result.length > 0, 'Should return a non-empty string');
    });
});

describe('formatYearsRemaining', () => {
    it('returns null when life expectancy data is missing', () => {
        assert.strictEqual(formatYearsRemaining(10, null, null, null, null), null);
    });

    it('calculates remaining years (long format) from known age', () => {
        const result = formatYearsRemaining(10, null, null, 12, 15);
        assert.ok(result !== null, 'Should return a result');
        assert.ok(result!.includes('years'), `Expected "years" in "${result}"`);
    });

    it('uses short format when requested', () => {
        const result = formatYearsRemaining(10, null, null, 12, 15, { short: true });
        assert.ok(result !== null, 'Should return a result');
        assert.ok(result!.includes('yrs'), `Expected "yrs" in "${result}"`);
    });

    it('uses range-against-range with CV estimates', () => {
        // CV 9-12, life exp 7-10
        // remainingLow = max(0, 7 - 12) = 0, remainingHigh = max(0, 10 - 9) = 1
        const result = formatYearsRemaining(null, 9, 12, 7, 10);
        assert.ok(result !== null, 'Should return a result');
        assert.ok(result !== 'near end of life', `Should NOT be "near end of life", got "${result}"`);
    });

    it('returns near end of life only when truly past', () => {
        // CV 13-16, life exp 7-10
        // remainingLow = max(0, 7 - 16) = 0, remainingHigh = max(0, 10 - 13) = 0
        const result = formatYearsRemaining(null, 13, 16, 7, 10);
        assert.strictEqual(result, 'near end of life');
    });

    it('uses union range when both ages present', () => {
        // Shelter 10, CV 9-12, life exp 7-15
        // Union: ageLow=9, ageHigh=12
        // remainingLow = max(0, 7 - 12) = 0, remainingHigh = max(0, 15 - 9) = 6
        const result = formatYearsRemaining(10, 9, 12, 7, 15);
        assert.ok(result !== null);
        assert.ok(result!.includes('6'), `Expected "6" in "${result}"`);
    });
});

describe('getAgeDiscrepancy', () => {
    it('returns null when no CV data', () => {
        assert.strictEqual(getAgeDiscrepancy(10, null, null, 'NONE'), null);
    });

    it('returns null when ages agree', () => {
        const result = getAgeDiscrepancy(10, 9, 11, 'HIGH');
        assert.strictEqual(result, null);
    });

    it('returns discrepancy when ages disagree', () => {
        const result = getAgeDiscrepancy(5, 10, 12, 'HIGH');
        assert.ok(result !== null, 'Should detect discrepancy');
        assert.ok(result!.message.length > 0);
    });
});

describe('computeHealthScore', () => {
    it('returns null when no health data', () => {
        assert.strictEqual(computeHealthScore(null, null, [], null, [], null), null);
    });

    it('returns good score for healthy animal', () => {
        const result = computeHealthScore(5, 'GOOD', [], 'LOW', [], 'LOW');
        assert.ok(result !== null);
        assert.ok(result!.score >= 70, `Expected good score, got ${result!.score}`);
    });

    it('returns lower score for concerning indicators', () => {
        const result = computeHealthScore(2, 'POOR', ['limping', 'skin lesions'], 'HIGH', ['cowering'], 'HIGH');
        assert.ok(result !== null);
        assert.ok(result!.score < 70, `Expected lower score, got ${result!.score}`);
    });
});

describe('getSaveRate', () => {
    it('returns null for zero intake', () => {
        assert.strictEqual(getSaveRate(0, 0), null);
    });

    it('calculates correct rate', () => {
        assert.strictEqual(getSaveRate(1000, 100), 90);
    });

    it('caps at 100', () => {
        assert.strictEqual(getSaveRate(100, 0), 100);
    });
});
