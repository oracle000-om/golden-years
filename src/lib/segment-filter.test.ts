/**
 * Tests for segment-filter.ts — GYC senior segmentation logic.
 *
 * Run: npx tsx --test src/lib/segment-filter.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seniorThreshold, shouldExclude, buildGYCClause, DOG_SENIOR_BY_SIZE } from './segment-filter';

// ─── seniorThreshold ─────────────────────────────────────

describe('seniorThreshold', () => {
    it('returns 10 for cats', () => {
        assert.strictEqual(seniorThreshold('CAT', null), 10);
    });

    it('returns 10 for cats regardless of size', () => {
        assert.strictEqual(seniorThreshold('CAT', 'LARGE'), 10);
    });

    it('returns 5 for XLARGE dogs', () => {
        assert.strictEqual(seniorThreshold('DOG', 'XLARGE'), 5);
    });

    it('returns 6 for LARGE dogs', () => {
        assert.strictEqual(seniorThreshold('DOG', 'LARGE'), 6);
    });

    it('returns 7 for MEDIUM dogs', () => {
        assert.strictEqual(seniorThreshold('DOG', 'MEDIUM'), 7);
    });

    it('returns 9 for SMALL dogs', () => {
        assert.strictEqual(seniorThreshold('DOG', 'SMALL'), 9);
    });

    it('returns 7 (default) for dogs with unknown size', () => {
        assert.strictEqual(seniorThreshold('DOG', null), 7);
    });

    it('returns 7 (default) for other species', () => {
        assert.strictEqual(seniorThreshold('OTHER', null), 7);
    });
});

// ─── shouldExclude ───────────────────────────────────────

describe('shouldExclude', () => {
    const makeAnimal = (species: string, size: string | null, cvHigh: number | null | undefined) => ({
        species,
        size,
        assessment: cvHigh !== undefined ? { ageEstimatedHigh: cvHigh } : undefined,
    });

    it('excludes a cat with CV high below 10', () => {
        assert.strictEqual(shouldExclude(makeAnimal('CAT', null, 5) as any), true);
    });

    it('does NOT exclude a cat with CV high >= 10', () => {
        assert.strictEqual(shouldExclude(makeAnimal('CAT', null, 10) as any), false);
    });

    it('excludes an XLARGE dog with CV high below 5', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'XLARGE', 4) as any), true);
    });

    it('does NOT exclude an XLARGE dog with CV high >= 5', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'XLARGE', 5) as any), false);
    });

    it('excludes a LARGE dog with CV high below 6', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'LARGE', 5) as any), true);
    });

    it('does NOT exclude a LARGE dog with CV high >= 6', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'LARGE', 6) as any), false);
    });

    it('excludes a MEDIUM dog with CV high below 7', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'MEDIUM', 6) as any), true);
    });

    it('does NOT exclude a MEDIUM dog with CV high >= 7', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'MEDIUM', 7) as any), false);
    });

    it('excludes a SMALL dog with CV high below 9', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'SMALL', 8) as any), true);
    });

    it('does NOT exclude a SMALL dog with CV high >= 9', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'SMALL', 9) as any), false);
    });

    it('does NOT exclude an animal with no CV assessment', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'LARGE', undefined) as any), false);
    });

    it('does NOT exclude an animal with null CV high', () => {
        assert.strictEqual(shouldExclude(makeAnimal('DOG', 'LARGE', null) as any), false);
    });
});

// ─── buildGYCClause ──────────────────────────────────────

describe('buildGYCClause', () => {
    it('returns an object with a NOT.OR array', () => {
        const clause = buildGYCClause();
        assert.ok('NOT' in clause, 'Must have NOT key');
        const not = clause.NOT as Record<string, unknown>;
        assert.ok(Array.isArray(not.OR), 'NOT must contain OR array');
    });

    it('has 6 exclusion rules (CAT + 4 dog sizes + dog null-size)', () => {
        const clause = buildGYCClause();
        const rules = (clause.NOT as any).OR as unknown[];
        assert.strictEqual(rules.length, 6);
    });

    it('uses correct thresholds from DOG_SENIOR_BY_SIZE constants', () => {
        const clause = buildGYCClause();
        const rules = (clause.NOT as any).OR as any[];

        // Cat rule — lt: 10
        const catRule = rules.find((r: any) => r.AND.some((c: any) => c.species === 'CAT'));
        assert.ok(catRule, 'Should have a cat rule');
        const catAssessment = catRule.AND.find((c: any) => c.assessment);
        assert.strictEqual(catAssessment.assessment.ageEstimatedHigh.lt, 10);

        // Check each dog size
        for (const [size, threshold] of Object.entries(DOG_SENIOR_BY_SIZE)) {
            const rule = rules.find((r: any) =>
                r.AND.some((c: any) => c.size === size) &&
                r.AND.some((c: any) => c.species === 'DOG'),
            );
            assert.ok(rule, `Should have a rule for DOG size ${size}`);
            const assessment = rule.AND.find((c: any) => c.assessment);
            assert.strictEqual(
                assessment.assessment.ageEstimatedHigh.lt,
                threshold,
                `DOG ${size} threshold should be ${threshold}`,
            );
        }
    });
});
