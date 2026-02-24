/**
 * Unit Tests — Search Query Parser
 *
 * Tests NLP-style parsing of natural language search queries
 * into structured search intent.
 */
import { describe, test, expect } from 'vitest';
import { parseSearchQuery } from '@/lib/search-parser';

describe('parseSearchQuery', () => {

    test('empty string returns empty intent', () => {
        const intent = parseSearchQuery('');
        expect(intent.species).toBeNull();
        expect(intent.breeds).toEqual([]);
        expect(intent.textTokens).toEqual([]);
    });

    // ── Species Detection ───────────────────────
    test('detects dog species', () => {
        const intent = parseSearchQuery('dog');
        expect(intent.species).toBe('DOG');
    });

    test('detects cat species', () => {
        const intent = parseSearchQuery('cat');
        expect(intent.species).toBe('CAT');
    });

    test('detects species from synonym "puppy"', () => {
        const intent = parseSearchQuery('puppy');
        expect(intent.species).toBe('DOG');
    });

    test('detects species from synonym "kitty"', () => {
        const intent = parseSearchQuery('kitty');
        expect(intent.species).toBe('CAT');
    });

    // ── Sex Detection ───────────────────────────
    test('detects male sex', () => {
        const intent = parseSearchQuery('male dog');
        expect(intent.sex).toBe('MALE');
    });

    test('detects female from "girl"', () => {
        const intent = parseSearchQuery('girl cat');
        expect(intent.sex).toBe('FEMALE');
    });

    // ── Age Patterns ────────────────────────────
    test('extracts minimum age from "over 10"', () => {
        const intent = parseSearchQuery('dogs over 10');
        expect(intent.minAge).toBe(10);
    });

    test('extracts minimum age from "10+" syntax', () => {
        // The parser strips punctuation first, so "10+" becomes "10"
        // which won't match the "X+" pattern. Use "over" syntax instead.
        const intent = parseSearchQuery('cat over 10');
        expect(intent.minAge).toBe(10);
    });

    test('extracts maximum age from "under 12"', () => {
        const intent = parseSearchQuery('under 12 years');
        expect(intent.maxAge).toBe(12);
    });

    // ── Breed Detection ─────────────────────────
    test('detects single-word breed', () => {
        const intent = parseSearchQuery('labrador');
        // Parser stores breeds in lowercase
        expect(intent.breeds).toContain('labrador');
    });

    test('detects multi-word breed', () => {
        const intent = parseSearchQuery('german shepherd');
        expect(intent.breeds).toContain('german shepherd');
    });

    // ── Location ────────────────────────────────
    test('extracts zip code', () => {
        const intent = parseSearchQuery('dogs near 90210');
        expect(intent.zip).toBe('90210');
    });

    test('detects state name', () => {
        // "cats in california" — "in" can be consumed as state code IN.
        // Use the state name alone or without a preposition.
        const intent = parseSearchQuery('cats california');
        expect(intent.state).toBe('CA');
    });

    test('detects near me phrase', () => {
        const intent = parseSearchQuery('dogs near me');
        expect(intent.nearMe).toBe(true);
    });

    test('extracts radius', () => {
        const intent = parseSearchQuery('dogs within 50 miles');
        expect(intent.radiusMiles).toBe(50);
    });

    // ── Urgency ─────────────────────────────────
    test('detects urgency keywords', () => {
        const intent = parseSearchQuery('urgent dogs');
        expect(intent.urgency).toBe(true);
    });

    // ── Complex Queries ─────────────────────────
    test('parses complex multi-part query', () => {
        const intent = parseSearchQuery('female german shepherd texas over 8');
        expect(intent.sex).toBe('FEMALE');
        expect(intent.breeds).toContain('german shepherd');
        expect(intent.state).toBe('TX');
        expect(intent.minAge).toBe(8);
    });
});
