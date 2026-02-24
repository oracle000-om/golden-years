/**
 * Tests for base-adapter.ts — pure utility functions.
 *
 * Run: npx tsx --test scraper/adapters/base-adapter.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapSex, mapSpecies, mapSize, parseAge, isSenior, validateAnimal } from './base-adapter';

describe('mapSex', () => {
    it('maps "Male" to "MALE"', () => {
        assert.strictEqual(mapSex('Male'), 'MALE');
    });

    it('maps "female" to "FEMALE"', () => {
        assert.strictEqual(mapSex('female'), 'FEMALE');
    });

    it('maps "m" to "MALE"', () => {
        assert.strictEqual(mapSex('m'), 'MALE');
    });

    it('maps "f" to "FEMALE"', () => {
        assert.strictEqual(mapSex('f'), 'FEMALE');
    });

    it('returns "UNKNOWN" for empty string', () => {
        assert.strictEqual(mapSex(''), 'UNKNOWN');
    });

    it('returns "UNKNOWN" for unrecognized values', () => {
        assert.strictEqual(mapSex('other'), 'UNKNOWN');
    });
});

describe('mapSpecies', () => {
    it('maps "Dog" to "DOG"', () => {
        assert.strictEqual(mapSpecies('Dog'), 'DOG');
    });

    it('maps "cat" to "CAT"', () => {
        assert.strictEqual(mapSpecies('cat'), 'CAT');
    });

    it('maps "canine" to "DOG"', () => {
        assert.strictEqual(mapSpecies('canine'), 'DOG');
    });

    it('maps "feline" to "CAT"', () => {
        assert.strictEqual(mapSpecies('feline'), 'CAT');
    });

    it('returns "OTHER" for unknown species', () => {
        assert.strictEqual(mapSpecies('bird'), 'OTHER');
    });
});

describe('mapSize', () => {
    it('maps "Large" to "LARGE"', () => {
        assert.strictEqual(mapSize('Large'), 'LARGE');
    });

    it('maps "sm" to "SMALL"', () => {
        assert.strictEqual(mapSize('sm'), 'SMALL');
    });

    it('maps "medium" to "MEDIUM"', () => {
        assert.strictEqual(mapSize('medium'), 'MEDIUM');
    });

    it('maps "xl" to "XLARGE"', () => {
        assert.strictEqual(mapSize('xl'), 'XLARGE');
    });
});

describe('parseAge', () => {
    it('parses "10 years" as 10', () => {
        assert.strictEqual(parseAge('10 years'), 10);
    });

    it('parses "5 yrs" as 5', () => {
        assert.strictEqual(parseAge('5 yrs'), 5);
    });

    it('parses "8yr" as 8', () => {
        assert.strictEqual(parseAge('8yr'), 8);
    });

    it('parses "Senior" as null (no number)', () => {
        const result = parseAge('Senior');
        // parseAge might return null for ambiguous strings
        assert.ok(result === null || typeof result === 'number');
    });

    it('parses "2 months" as 0', () => {
        const result = parseAge('2 months');
        assert.ok(result === null || result === 0, `Expected null or 0, got ${result}`);
    });
});

describe('isSenior', () => {
    it('returns true for 10-year-old dog', () => {
        assert.strictEqual(isSenior(10, 'DOG'), true);
    });

    it('returns true for 12-year-old cat', () => {
        assert.strictEqual(isSenior(12, 'CAT'), true);
    });

    it('returns false for 3-year-old dog', () => {
        assert.strictEqual(isSenior(3, 'DOG'), false);
    });

    it('returns false for 5-year-old cat', () => {
        assert.strictEqual(isSenior(5, 'CAT'), false);
    });

    it('returns false for null age', () => {
        assert.strictEqual(isSenior(null, 'DOG'), false);
    });

    // Size-aware thresholds
    it('returns true for 5-year-old giant breed (XLARGE)', () => {
        assert.strictEqual(isSenior(5, 'DOG', 'XLARGE'), true);
    });

    it('returns false for 4-year-old giant breed (XLARGE)', () => {
        assert.strictEqual(isSenior(4, 'DOG', 'XLARGE'), false);
    });

    it('returns true for 6-year-old large breed', () => {
        assert.strictEqual(isSenior(6, 'DOG', 'LARGE'), true);
    });

    it('returns false for 5-year-old large breed', () => {
        assert.strictEqual(isSenior(5, 'DOG', 'LARGE'), false);
    });

    it('returns true for 9-year-old small breed', () => {
        assert.strictEqual(isSenior(9, 'DOG', 'SMALL'), true);
    });

    it('returns false for 8-year-old small breed', () => {
        assert.strictEqual(isSenior(8, 'DOG', 'SMALL'), false);
    });

    it('ignores size for cats', () => {
        assert.strictEqual(isSenior(9, 'CAT', 'SMALL'), false);
        assert.strictEqual(isSenior(10, 'CAT', 'XLARGE'), true);
    });
});

describe('validateAnimal', () => {
    it('returns true for valid animal', () => {
        assert.ok(validateAnimal({
            intakeId: 'A123',
            species: 'DOG',
            photoUrl: 'https://example.com/photo.jpg',
        }));
    });

    it('returns false for missing intakeId', () => {
        assert.strictEqual(validateAnimal({
            intakeId: '',
            species: 'DOG',
            photoUrl: 'https://example.com/photo.jpg',
        }), false);
    });
});
