/**
 * Match Profiles — Adoptability badges from CV signals.
 *
 * Produces human-friendly match tags based on CV-assessed
 * energy, mobility, grooming, stress, aggression, and care level.
 * Gated on ageConfidence HIGH/MEDIUM with a 2-of-3 signal threshold
 * to avoid speculative labels.
 */

import type { AnimalAssessment } from './types';

export interface MatchBadge {
    label: string;
    icon: string;
}

/**
 * Compute match profiles for an animal.
 * Returns an array of badges, max ~3 per animal.
 */
export function getMatchProfiles(assessment: Pick<AnimalAssessment,
    'ageConfidence' | 'energyLevel' | 'mobilityAssessment' | 'groomingNeeds' |
    'estimatedCareLevel' | 'stressLevel' | 'aggressionRisk'
> | null | undefined): MatchBadge[] {
    if (!assessment) return [];
    // Gate: only HIGH/MEDIUM confidence
    if (assessment.ageConfidence !== 'HIGH' && assessment.ageConfidence !== 'MEDIUM') {
        return [];
    }

    const badges: MatchBadge[] = [];

    const energy = assessment.energyLevel;
    const mobility = assessment.mobilityAssessment;
    const grooming = assessment.groomingNeeds;
    const care = assessment.estimatedCareLevel;
    const aggression = assessment.aggressionRisk;
    const stress = assessment.stressLevel;

    // ── Single story / elevator preferred ──
    // Triggered by limited/impaired mobility (arthritis, joint issues)
    if (mobility === 'limited' || mobility === 'impaired') {
        badges.push({ label: 'Single story or elevator preferred', icon: '🏠' });
    }

    // ── Great for apartments ──
    // Low energy + minimal grooming + low care (2 of 3)
    {
        const signals = [
            energy === 'low',
            grooming === 'minimal',
            care === 'low',
        ].filter(Boolean).length;
        if (signals >= 2) {
            badges.push({ label: 'Great for apartments', icon: '🏢' });
        }
    }

    // ── Good with families ──
    // Low aggression + low stress + moderate energy (2 of 3)
    {
        const signals = [
            aggression !== null && aggression <= 2,
            stress === 'low',
            energy === 'moderate' || energy === 'low',
        ].filter(Boolean).length;
        if (signals >= 2 && !badges.some(b => b.label.includes('families'))) {
            badges.push({ label: 'Good with families', icon: '👨‍👩‍👧' });
        }
    }

    // ── Needs an active home ──
    // High energy + normal mobility (both required)
    if (energy === 'high' && mobility === 'normal') {
        badges.push({ label: 'Needs an active home', icon: '🏃' });
    }

    // ── Couch companion ──
    // Limited mobility + low energy (both required), but don't double up with apartment badge
    if ((mobility === 'limited' || mobility === 'impaired') && energy === 'low') {
        badges.push({ label: 'Couch companion', icon: '🛋️' });
    }

    // ── Needs a dedicated groomer ──
    // Extensive grooming + moderate/high care (both required)
    if (grooming === 'extensive' && (care === 'moderate' || care === 'high')) {
        badges.push({ label: 'Needs a dedicated groomer', icon: '✂️' });
    }

    return badges.slice(0, 4); // cap at 4 badges max
}
