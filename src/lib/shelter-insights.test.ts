/**
 * Tests for buildShelterStoryInsights — enriched shelter storytelling.
 *
 * Run: npx tsx --test src/lib/shelter-insights.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildShelterStoryInsights, type StoryInsightsInput } from './utils';

/** Base shelter obj with no data — override fields as needed */
const baseShelter: StoryInsightsInput['shelter'] = {
    shelterType: 'MUNICIPAL',
    totalIntakeAnnual: 0,
    totalEuthanizedAnnual: 0,
    dataYear: null,
    countyPopulation: null,
    totalTransferred: null,
    priorYearIntake: null,
    priorYearEuthanized: null,
    priorDataYear: null,
    state: 'TX',
};

describe('buildShelterStoryInsights', () => {
    it('returns empty array when no data', () => {
        const result = buildShelterStoryInsights({ shelter: baseShelter, avgDaysWaiting: null });
        assert.deepStrictEqual(result, []);
    });

    it('generates high save rate insight above 90%', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 50, dataYear: 2024 },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('95%') && r.includes('no-kill benchmark')));
    });

    it('generates warning for low save rate', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 400 },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('60%') && r.includes('higher-risk')));
    });

    it('generates intake drop insight', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 800, totalEuthanizedAnnual: 100, priorYearIntake: 1000, priorDataYear: 2023 },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('Intake dropped') && r.includes('20%')));
    });

    it('generates intake rise insight', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1200, totalEuthanizedAnnual: 100, priorYearIntake: 1000, priorDataYear: 2023 },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('Intake rose') && r.includes('20%')));
    });

    it('generates euthanasia trend insights', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 80, priorYearEuthanized: 200 },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('Euthanasia down') && r.includes('positive trend')));
    });

    it('generates transfer partnership insight', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 100, totalTransferred: 250 },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('25%') && r.includes('rescue partners')));
    });

    it('generates avg wait time insight', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 100 },
            avgDaysWaiting: 47,
        });
        assert.ok(result.some(r => r.includes('47 days')));
    });

    it('generates financial insight with program spend', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 100 },
            financials: {
                taxPeriod: 2023,
                totalRevenue: 2400000,
                totalExpenses: 2200000,
                contributions: 1800000,
                programRevenue: 400000,
                fundraisingExpense: 100000,
                officerCompensation: 150000,
            },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('$2.4M') && r.includes('programs')));
    });

    it('generates fundraising efficiency insight', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 100 },
            financials: {
                taxPeriod: 2023,
                totalRevenue: 2000000,
                totalExpenses: 1800000,
                contributions: 1500000,
                programRevenue: 300000,
                fundraisingExpense: 150000,
                officerCompensation: 120000,
            },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('10¢ per dollar raised')));
    });

    it('generates foster-based type insight', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, shelterType: 'FOSTER_BASED' },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('Foster-based') && r.includes('homes')));
    });

    it('generates state holding period insight', () => {
        const result = buildShelterStoryInsights({
            shelter: baseShelter,
            statePolicy: { holdingPeriodDays: 3, mandatoryReporting: true, reportingBody: 'TAHC' },
            avgDaysWaiting: null,
        });
        assert.ok(result.some(r => r.includes('Texas') && r.includes('3-day')));
    });

    it('caps at 8 insights', () => {
        const result = buildShelterStoryInsights({
            shelter: {
                ...baseShelter,
                shelterType: 'FOSTER_BASED',
                totalIntakeAnnual: 1000,
                totalEuthanizedAnnual: 50,
                dataYear: 2024,
                countyPopulation: 50000,
                totalTransferred: 200,
                priorYearIntake: 1200,
                priorYearEuthanized: 150,
                priorDataYear: 2023,
            },
            financials: {
                taxPeriod: 2023,
                totalRevenue: 2400000,
                totalExpenses: 2200000,
                contributions: 1800000,
                programRevenue: 400000,
                fundraisingExpense: 100000,
                officerCompensation: 150000,
            },
            statePolicy: { holdingPeriodDays: 3, mandatoryReporting: true, reportingBody: 'TAHC' },
            avgDaysWaiting: 47,
        });
        assert.ok(result.length <= 8, `Expected at most 8 insights, got ${result.length}`);
    });

    it('returns no financial insights when financials null', () => {
        const result = buildShelterStoryInsights({
            shelter: { ...baseShelter, totalIntakeAnnual: 1000, totalEuthanizedAnnual: 100 },
            financials: null,
            avgDaysWaiting: null,
        });
        assert.ok(!result.some(r => r.includes('revenue') || r.includes('fundraising')));
    });
});
