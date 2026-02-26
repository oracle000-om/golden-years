/**
 * Tests for ProPublica adapter fuzzy matching logic.
 */

import { describe, it, expect } from 'vitest';
import {
    normalizeNameTokens,
    jaccardSimilarity,
    matchShelterToNonprofit,
    type ProPublicaSearchResult,
} from '../../scraper/adapters/propublica';

describe('normalizeNameTokens', () => {
    it('lowercases and strips punctuation', () => {
        expect(normalizeNameTokens('Jacksonville Humane Society')).toEqual([
            'jacksonville', 'humane',
        ]);
    });

    it('strips common legal suffixes', () => {
        expect(normalizeNameTokens('Halifax Humane Society Inc')).toEqual([
            'halifax', 'humane',
        ]);
    });

    it('strips "the" and "of"', () => {
        expect(normalizeNameTokens('The SPCA of Westchester')).toEqual([
            'spca', 'westchester',
        ]);
    });

    it('handles apostrophes and special chars', () => {
        expect(normalizeNameTokens("Noah's Ark Animal Rescue")).toEqual([
            'noahs', 'ark', 'animal', 'rescue',
        ]);
    });
});

describe('jaccardSimilarity', () => {
    it('returns 1 for identical sets', () => {
        expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    });

    it('returns 0 for disjoint sets', () => {
        expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
    });

    it('returns 0.5 for half overlap', () => {
        expect(jaccardSimilarity(['a', 'b'], ['a', 'c'])).toBeCloseTo(0.333, 2);
    });

    it('returns 0 for empty sets', () => {
        expect(jaccardSimilarity([], [])).toBe(0);
    });
});

describe('matchShelterToNonprofit', () => {
    const makeCandidates = (items: Array<{ name: string; city: string; state: string }>): ProPublicaSearchResult[] =>
        items.map((item, i) => ({
            ein: 100000000 + i,
            strein: `10-000000${i}`,
            name: item.name,
            sub_name: item.name,
            city: item.city,
            state: item.state,
            ntee_code: 'D200',
            score: 50,
        }));

    it('matches identical names', () => {
        const candidates = makeCandidates([
            { name: 'Jacksonville Humane Society', city: 'Jacksonville', state: 'FL' },
        ]);
        const match = matchShelterToNonprofit('Jacksonville Humane Society', 'Jacksonville', candidates);
        expect(match).not.toBeNull();
        expect(match!.name).toBe('Jacksonville Humane Society');
    });

    it('matches case-insensitively', () => {
        const candidates = makeCandidates([
            { name: 'JACKSONVILLE HUMANE SOCIETY', city: 'Jacksonville', state: 'FL' },
        ]);
        const match = matchShelterToNonprofit('Jacksonville Humane Society', 'Jacksonville', candidates);
        expect(match).not.toBeNull();
    });

    it('matches when one has "Inc" suffix', () => {
        const candidates = makeCandidates([
            { name: 'Halifax Humane Society Inc', city: 'Daytona Beach', state: 'FL' },
        ]);
        const match = matchShelterToNonprofit('Halifax Humane Society', 'Daytona Beach', candidates);
        expect(match).not.toBeNull();
    });

    it('returns null for no confident match', () => {
        const candidates = makeCandidates([
            { name: 'Totally Different Organization', city: 'Nowhere', state: 'FL' },
        ]);
        const match = matchShelterToNonprofit('Jacksonville Humane Society', 'Jacksonville', candidates);
        expect(match).toBeNull();
    });

    it('returns null for empty candidates', () => {
        const match = matchShelterToNonprofit('Test Shelter', 'City', []);
        expect(match).toBeNull();
    });

    it('prefers city-matched candidate when similarities are close', () => {
        const candidates = makeCandidates([
            { name: 'County Humane Rescue', city: 'Springfield', state: 'IL' },
            { name: 'County Humane Rescue', city: 'Urbana', state: 'IL' },
        ]);
        const match = matchShelterToNonprofit('County Humane Rescue', 'Springfield', candidates);
        expect(match).not.toBeNull();
        expect(match!.city).toBe('Springfield');
    });
});
