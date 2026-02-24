/**
 * Tests for search-parser.ts — NLP query parsing.
 *
 * Run: npx tsx --test src/lib/search-parser.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery } from './search-parser';

describe('parseSearchQuery', () => {
    describe('species detection', () => {
        it('detects "dog" as DOG species', () => {
            const result = parseSearchQuery('dog');
            assert.strictEqual(result.species, 'DOG');
        });

        it('detects "cat" as CAT species', () => {
            const result = parseSearchQuery('cat');
            assert.strictEqual(result.species, 'CAT');
        });

        it('detects "kitten" as CAT species', () => {
            const result = parseSearchQuery('kitten');
            assert.strictEqual(result.species, 'CAT');
        });

        it('detects "puppy" as DOG species', () => {
            const result = parseSearchQuery('puppy');
            assert.strictEqual(result.species, 'DOG');
        });

        it('returns null species for unrelated query', () => {
            const result = parseSearchQuery('senior');
            assert.strictEqual(result.species, null);
        });
    });

    describe('sex detection', () => {
        it('detects "female" as FEMALE', () => {
            const result = parseSearchQuery('female dog');
            assert.strictEqual(result.sex, 'FEMALE');
        });

        it('detects "male" as MALE', () => {
            const result = parseSearchQuery('male cat');
            assert.strictEqual(result.sex, 'MALE');
        });

        it('detects "girl" as FEMALE', () => {
            const result = parseSearchQuery('girl dog');
            assert.strictEqual(result.sex, 'FEMALE');
        });

        it('detects "boy" as MALE', () => {
            const result = parseSearchQuery('boy cat');
            assert.strictEqual(result.sex, 'MALE');
        });
    });

    describe('size detection', () => {
        it('detects "small" as SMALL', () => {
            const result = parseSearchQuery('small dog');
            assert.strictEqual(result.size, 'SMALL');
        });

        it('detects "large" as LARGE', () => {
            const result = parseSearchQuery('large dog');
            assert.strictEqual(result.size, 'LARGE');
        });
    });

    describe('breed detection', () => {
        it('detects "labrador" breed', () => {
            const result = parseSearchQuery('labrador');
            assert.ok(result.breeds.length > 0, 'Should detect labrador breed');
            assert.ok(
                result.breeds.some(b => b.toLowerCase().includes('labrador')),
                `Breeds ${result.breeds} should include labrador`,
            );
        });

        it('detects "golden retriever" breed', () => {
            const result = parseSearchQuery('golden retriever');
            assert.ok(result.breeds.length > 0, 'Should detect golden retriever');
        });

        it('detects "siamese" breed for cats', () => {
            const result = parseSearchQuery('siamese cat');
            assert.ok(result.breeds.length > 0, 'Should detect siamese breed');
        });
    });

    describe('age range detection', () => {
        it('detects "over 10" as minAge', () => {
            const result = parseSearchQuery('dog over 10');
            assert.strictEqual(result.minAge, 10);
        });

        it('detects "under 8" as maxAge', () => {
            const result = parseSearchQuery('cat under 8');
            assert.strictEqual(result.maxAge, 8);
        });

        it('detects "older than 10" as minAge', () => {
            const result = parseSearchQuery('dog older than 10');
            assert.ok(result.minAge !== null, 'Should detect minAge');
        });
    });

    describe('state detection', () => {
        it('detects "California" as state', () => {
            const result = parseSearchQuery('dog California');
            assert.strictEqual(result.state, 'CA');
        });

        it('detects "TX" as state', () => {
            const result = parseSearchQuery('cat TX');
            assert.strictEqual(result.state, 'TX');
        });
    });

    describe('zip code detection', () => {
        it('detects 5-digit zip code', () => {
            const result = parseSearchQuery('dog near 90210');
            assert.strictEqual(result.zip, '90210');
        });
    });

    describe('urgency detection', () => {
        it('detects "urgent" keyword', () => {
            const result = parseSearchQuery('urgent dogs');
            assert.strictEqual(result.urgency, true);
        });

        it('detects "euthanasia" keyword', () => {
            const result = parseSearchQuery('euthanasia list');
            assert.strictEqual(result.urgency, true);
        });
    });

    describe('complex queries', () => {
        it('parses multi-intent query', () => {
            const result = parseSearchQuery('female golden retriever California');
            assert.strictEqual(result.sex, 'FEMALE');
            assert.strictEqual(result.state, 'CA');
            assert.ok(result.breeds.length > 0, 'Should detect breed');
        });

        it('handles empty query', () => {
            const result = parseSearchQuery('');
            assert.strictEqual(result.species, null);
            assert.strictEqual(result.sex, null);
            assert.deepStrictEqual(result.breeds, []);
        });
    });
});
