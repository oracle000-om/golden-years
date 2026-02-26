/**
 * Unit Tests — Base Adapter Pure Functions
 *
 * Tests the shared scraper utilities that determine which animals
 * get surfaced. If these break, animals get silently excluded.
 */
import { describe, test, expect } from 'vitest';
import {
    isSenior,
    mapSex,
    mapSpecies,
    mapSize,
    parseAge,
    validateAnimal,
} from '../../scraper/adapters/base-adapter';

// ────────────────────────────────────────────
// isSenior — THE critical function for the platform
// If this is wrong, senior animals are either excluded or
// non-seniors pollute the feed.
// ────────────────────────────────────────────
describe('isSenior', () => {
    // Dogs — size-aware thresholds
    test('XLARGE dog: senior at 5+', () => {
        expect(isSenior(4, 'DOG', 'XLARGE')).toBe(false);
        expect(isSenior(5, 'DOG', 'XLARGE')).toBe(true);
        expect(isSenior(6, 'DOG', 'XLARGE')).toBe(true);
    });

    test('LARGE dog: senior at 6+', () => {
        expect(isSenior(5, 'DOG', 'LARGE')).toBe(false);
        expect(isSenior(6, 'DOG', 'LARGE')).toBe(true);
    });

    test('MEDIUM dog: senior at 7+', () => {
        expect(isSenior(6, 'DOG', 'MEDIUM')).toBe(false);
        expect(isSenior(7, 'DOG', 'MEDIUM')).toBe(true);
    });

    test('SMALL dog: senior at 9+', () => {
        expect(isSenior(8, 'DOG', 'SMALL')).toBe(false);
        expect(isSenior(9, 'DOG', 'SMALL')).toBe(true);
    });

    test('dog with unknown size: defaults to 7+', () => {
        expect(isSenior(6, 'DOG', null)).toBe(false);
        expect(isSenior(7, 'DOG', null)).toBe(true);
        expect(isSenior(7, 'DOG')).toBe(true);
    });

    // Cats
    test('cat: senior at 10+', () => {
        expect(isSenior(9, 'CAT')).toBe(false);
        expect(isSenior(10, 'CAT')).toBe(true);
        expect(isSenior(15, 'CAT')).toBe(true);
    });

    test('cat ignores size parameter', () => {
        expect(isSenior(9, 'CAT', 'SMALL')).toBe(false);
        expect(isSenior(10, 'CAT', 'LARGE')).toBe(true);
    });

    // Edge cases
    test('null age is never senior', () => {
        expect(isSenior(null, 'DOG')).toBe(false);
        expect(isSenior(undefined, 'CAT')).toBe(false);
    });

    test('OTHER species defaults to 7+', () => {
        expect(isSenior(6, 'OTHER')).toBe(false);
        expect(isSenior(7, 'OTHER')).toBe(true);
    });

    test('exact threshold boundary (not off-by-one)', () => {
        // Giant breed at exactly 5 should be senior
        expect(isSenior(5, 'DOG', 'XLARGE')).toBe(true);
        // Cat at exactly 10 should be senior
        expect(isSenior(10, 'CAT')).toBe(true);
    });
});

// ────────────────────────────────────────────
// mapSex
// ────────────────────────────────────────────
describe('mapSex', () => {
    test('standard values', () => {
        expect(mapSex('Male')).toBe('MALE');
        expect(mapSex('Female')).toBe('FEMALE');
        expect(mapSex('male')).toBe('MALE');
        expect(mapSex('FEMALE')).toBe('FEMALE');
    });

    test('single character codes', () => {
        expect(mapSex('M')).toBe('MALE');
        expect(mapSex('F')).toBe('FEMALE');
        expect(mapSex('m')).toBe('MALE');
        expect(mapSex('f')).toBe('FEMALE');
    });

    test('PetPoint spay/neuter codes', () => {
        expect(mapSex('N')).toBe('MALE');   // neutered
        expect(mapSex('S')).toBe('FEMALE'); // spayed
        expect(mapSex('n')).toBe('MALE');
        expect(mapSex('s')).toBe('FEMALE');
    });

    test('compound strings', () => {
        expect(mapSex('Neutered Male')).toBe('MALE');
        expect(mapSex('Spayed Female')).toBe('FEMALE');
        expect(mapSex('Intact Male')).toBe('MALE');
    });

    test('null/undefined/empty returns UNKNOWN', () => {
        expect(mapSex(null)).toBe('UNKNOWN');
        expect(mapSex(undefined)).toBe('UNKNOWN');
        expect(mapSex('')).toBe('UNKNOWN');
    });

    test('garbage input returns UNKNOWN', () => {
        expect(mapSex('other')).toBe('UNKNOWN');
        expect(mapSex('?')).toBe('UNKNOWN');
    });
});

// ────────────────────────────────────────────
// mapSpecies
// ────────────────────────────────────────────
describe('mapSpecies', () => {
    test('standard values', () => {
        expect(mapSpecies('Dog')).toBe('DOG');
        expect(mapSpecies('Cat')).toBe('CAT');
        expect(mapSpecies('dog')).toBe('DOG');
        expect(mapSpecies('CAT')).toBe('CAT');
    });

    test('alternate names', () => {
        expect(mapSpecies('Canine')).toBe('DOG');
        expect(mapSpecies('Feline')).toBe('CAT');
        expect(mapSpecies('k9')).toBe('DOG');
    });

    test('unmapped species returns OTHER', () => {
        expect(mapSpecies('Rabbit')).toBe('OTHER');
        expect(mapSpecies('Bird')).toBe('OTHER');
        expect(mapSpecies('Horse')).toBe('OTHER');
    });

    test('null/undefined returns OTHER', () => {
        expect(mapSpecies(null)).toBe('OTHER');
        expect(mapSpecies(undefined)).toBe('OTHER');
    });
});

// ────────────────────────────────────────────
// mapSize
// ────────────────────────────────────────────
describe('mapSize', () => {
    test('standard values', () => {
        expect(mapSize('Small')).toBe('SMALL');
        expect(mapSize('Medium')).toBe('MEDIUM');
        expect(mapSize('Large')).toBe('LARGE');
    });

    test('extra large variants', () => {
        expect(mapSize('X-Large')).toBe('XLARGE');
        expect(mapSize('XLarge')).toBe('XLARGE');
        expect(mapSize('Extra Large')).toBe('XLARGE');
    });

    test('abbreviations', () => {
        expect(mapSize('Med')).toBe('MEDIUM');
        expect(mapSize('med')).toBe('MEDIUM');
    });

    test('toy and mini map to SMALL', () => {
        expect(mapSize('Toy')).toBe('SMALL');
        expect(mapSize('Mini')).toBe('SMALL');
        expect(mapSize('miniature')).toBe('SMALL');
    });

    test('large is not confused with xlarge', () => {
        // "large" should match LARGE, not get caught by xlarge
        expect(mapSize('large')).toBe('LARGE');
        // But "x-large" should match XLARGE
        expect(mapSize('x-large')).toBe('XLARGE');
    });

    test('null/undefined returns null', () => {
        expect(mapSize(null)).toBeNull();
        expect(mapSize(undefined)).toBeNull();
    });
});

// ────────────────────────────────────────────
// parseAge
// ────────────────────────────────────────────
describe('parseAge', () => {
    test('parses year strings', () => {
        expect(parseAge('10 years')).toBe(10);
        expect(parseAge('7 Years')).toBe(7);
        expect(parseAge('1 year')).toBe(1);
    });

    test('parses compound year-month strings', () => {
        expect(parseAge('8 Years 3 Months')).toBe(8);
    });

    test('parses month-only strings', () => {
        expect(parseAge('6 months')).toBe(0);
        expect(parseAge('18 months')).toBe(1);
        expect(parseAge('36 Months')).toBe(3);
    });

    test('null/undefined returns null', () => {
        expect(parseAge(null)).toBeNull();
        expect(parseAge(undefined)).toBeNull();
        expect(parseAge('')).toBeNull();
    });

    test('unrecognized format returns null', () => {
        expect(parseAge('Senior')).toBeNull();
        expect(parseAge('Adult')).toBeNull();
    });
});

// ────────────────────────────────────────────
// validateAnimal
// ────────────────────────────────────────────
describe('validateAnimal', () => {
    test('valid animal passes', () => {
        const result = validateAnimal({
            intakeId: 'A123',
            species: 'DOG',
            photoUrl: 'https://example.com/photo.jpg',
            name: 'Buddy',
            breed: 'Labrador',
            ageKnownYears: 10,
            sex: 'MALE',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('missing required fields produces errors', () => {
        const result = validateAnimal({});
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing intakeId');
        expect(result.errors).toContain('Missing species');
        expect(result.errors).toContain('Missing photoUrl');
    });

    test('OTHER species is rejected', () => {
        const result = validateAnimal({
            intakeId: 'A123',
            species: 'OTHER',
            photoUrl: 'https://example.com/photo.jpg',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unsupported species (only DOG and CAT)');
    });

    test('placeholder names are rejected', () => {
        const result = validateAnimal({
            intakeId: 'A123',
            species: 'DOG',
            photoUrl: 'https://example.com/photo.jpg',
            name: 'Unknown',
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Placeholder name'))).toBe(true);
    });

    test('missing optional fields produce warnings', () => {
        const result = validateAnimal({
            intakeId: 'A123',
            species: 'DOG',
            photoUrl: 'https://example.com/photo.jpg',
        });
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Missing name');
        expect(result.warnings).toContain('Missing breed');
        expect(result.warnings).toContain('Missing ageKnownYears');
    });
});
