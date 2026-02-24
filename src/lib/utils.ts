/**
 * Format a date as a human-readable time-of-death marker
 * e.g., "Feb 20, 2026 at 8:00 AM"
 */
export function formatDeathMarker(date: Date | string | null): string {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

/**
 * Calculate hours remaining until a date
 */
export function hoursUntil(date: Date | string | null): number | null {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    return Math.max(0, Math.round(diff / (1000 * 60 * 60)));
}

/**
 * Get urgency level based on hours remaining
 */
export function getUrgencyLevel(hours: number | null): 'critical' | 'urgent' | 'warning' | 'standard' {
    if (hours === null) return 'standard';
    if (hours <= 24) return 'critical';
    if (hours <= 48) return 'urgent';
    if (hours <= 72) return 'warning';
    return 'standard';
}

// ─── Euthanasia Risk Score (ERS) ─────────────────────────
// Computed urgency from available data signals when no
// explicit euthanasia schedule is provided by the shelter.

/**
 * Calculate save rate (live release rate) from intake/euthanized numbers.
 * Returns a percentage 0-100, or null if no data.
 */
export function getSaveRate(totalIntake: number, totalEuthanized: number): number | null {
    if (totalIntake === 0) return null;
    return Math.round(((totalIntake - totalEuthanized) / totalIntake) * 1000) / 10;
}

/**
 * Format a one-line shelter stats summary.
 * e.g., "2024: 10,384 intake · 80.8% saved"
 */
export function formatShelterStats(
    totalIntake: number,
    totalEuthanized: number,
    dataYear: number | null
): string | null {
    const saveRate = getSaveRate(totalIntake, totalEuthanized);
    if (saveRate === null) return null;
    const yearPrefix = dataYear ? `${dataYear}: ` : '';
    return `${yearPrefix}${totalIntake.toLocaleString()} intake · ${saveRate}% saved`;
}

/**
 * Format age display with confidence if CV-estimated
 */
export function formatAge(
    knownYears: number | null,
    estimatedLow: number | null,
    estimatedHigh: number | null,
    confidence: string,
    source: string
): string {
    if (source === 'SHELTER_REPORTED' && knownYears !== null) {
        return `${knownYears} yr${knownYears !== 1 ? 's' : ''}`;
    }
    if (source === 'CV_ESTIMATED' && estimatedLow !== null && estimatedHigh !== null) {
        if (confidence === 'HIGH') {
            return `${estimatedLow}–${estimatedHigh} yrs`;
        }
        if (confidence === 'MEDIUM') {
            return `Likely senior · ${estimatedLow}–${estimatedHigh} yrs`;
        }
        return `Possibly senior · age uncertain`;
    }
    return 'Age unknown';
}

/**
 * Compute a realistic Golden Years confidence score (0–100) and reasoning.
 *
 * Factors:
 *   1. Base confidence from age source:
 *      - SHELTER_REPORTED: 50% (shelter intake estimates vary widely)
 *      - CV_ESTIMATED HIGH: 85%, MEDIUM: 65%, LOW: 40%
 *      - UNKNOWN: 30%
 *   2. Corroboration bonus: +15% if shelter and CV estimates agree (within 2 yrs)
 *   3. Breed data bonus: +5% if life expectancy data is available
 *   4. Narrower CV range bonus: +5% if range span ≤ 3 years
 */
export function getGoldenYearsConfidence(
    ageSource: string,
    ageConfidence: string,
    ageKnownYears: number | null,
    cvLow: number | null,
    cvHigh: number | null,
    lifeExpLow: number | null,
    lifeExpHigh: number | null,
): { percent: number; label: string; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // 1. Base confidence from source
    if (ageSource === 'CV_ESTIMATED') {
        if (ageConfidence === 'HIGH') {
            score = 85;
            reasons.push('CV analysis: high confidence — clear aging indicators');
        } else if (ageConfidence === 'MEDIUM') {
            score = 65;
            reasons.push('CV analysis: moderate confidence — some aging indicators');
        } else if (ageConfidence === 'LOW') {
            score = 40;
            reasons.push('CV analysis: low confidence — limited visual cues');
        } else {
            score = 25;
            reasons.push('CV analysis: inconclusive photo');
        }
    } else if (ageSource === 'SHELTER_REPORTED') {
        score = 50;
        reasons.push('Shelter-reported age (intake estimate)');
    } else {
        score = 30;
        reasons.push('Age from listing data');
    }

    // 2. Corroboration bonus — if both shelter and CV data exist and are close
    if (ageKnownYears !== null && cvLow !== null && cvHigh !== null) {
        const cvMid = (cvLow + cvHigh) / 2;
        const gap = Math.abs(ageKnownYears - cvMid);
        if (gap <= 2) {
            score = Math.min(100, score + 15);
            reasons.push('Corroborated: shelter & CV estimates agree');
        } else if (gap <= 4) {
            score = Math.min(100, score + 5);
            reasons.push('Partially corroborated: estimates within 4 years');
        }
    }

    // 3. Breed data bonus
    if (lifeExpLow !== null && lifeExpHigh !== null) {
        score = Math.min(100, score + 5);
        reasons.push('Breed lifespan data available');
    }

    // 4. Narrow range bonus (CV only)
    if (cvLow !== null && cvHigh !== null) {
        const span = cvHigh - cvLow;
        if (span <= 3) {
            score = Math.min(100, score + 5);
            reasons.push('Narrow age range (±' + span + ' yrs)');
        }
    }

    // Label
    let label: string;
    if (score >= 80) label = 'High';
    else if (score >= 55) label = 'Moderate';
    else if (score >= 35) label = 'Fair';
    else label = 'Low';

    return { percent: score, label, reasons };
}

/**
 * Determine if an animal qualifies as a senior.
 * Dogs: 7+ years. Cats: 10+ years.
 * Uses best available age (shelter-reported first, then CV midpoint).
 * Returns null if age cannot be determined.
 */
export function isSeniorAnimal(
    species: string,
    ageKnownYears: number | null,
    cvLow: number | null,
    cvHigh: number | null,
    ageSource: string,
): boolean | null {
    const threshold = species === 'CAT' ? 10 : 7;
    const best = getBestAge(ageKnownYears, cvLow, cvHigh, ageSource);
    if (!best) return null;
    return best.age >= threshold;
}

/**
 * Format intake reason as an empathetic display string
 */
export function formatIntakeReason(
    reason: string,
    detail: string | null
): string | null {
    const labels: Record<string, string> = {
        OWNER_SURRENDER: 'Owner surrendered',
        STRAY: 'Found as a stray',
        OWNER_DECEASED: 'Owner passed away',
        CONFISCATE: 'Seized from neglect or abuse',
        RETURN: 'Returned by adopter',
        TRANSFER: 'Transferred from another facility',
        INJURED: 'Found injured',
        OTHER: 'Other circumstances',
    };

    const label = labels[reason];
    if (!label) return null;

    if (detail) return `${label} — ${detail}`;
    return label;
}

/**
 * Calculate estimated years remaining from age + breed life expectancy.
 * Returns a human-readable string like "2–4 years" or null if insufficient data.
 */
export function formatYearsRemaining(
    ageKnownYears: number | null,
    ageEstimatedLow: number | null,
    ageEstimatedHigh: number | null,
    lifeExpLow: number | null,
    lifeExpHigh: number | null,
): string | null {
    if (lifeExpLow === null || lifeExpHigh === null) return null;

    // Use known age, or midpoint of estimated range
    let currentAge: number | null = null;
    if (ageKnownYears !== null) {
        currentAge = ageKnownYears;
    } else if (ageEstimatedLow !== null && ageEstimatedHigh !== null) {
        currentAge = Math.round((ageEstimatedLow + ageEstimatedHigh) / 2);
    }
    if (currentAge === null) return null;

    // Round to nearest 0.5
    const roundHalf = (n: number) => Math.round(n * 2) / 2;
    const remainingLow = roundHalf(Math.max(0, lifeExpLow - currentAge));
    const remainingHigh = roundHalf(Math.max(0, lifeExpHigh - currentAge));

    const fmt = (n: number) => Number.isInteger(n) ? `${n}` : `${n}`;

    if (remainingHigh === 0) return 'near end of life';
    if (remainingLow === remainingHigh) return `~${fmt(remainingLow)} year${remainingLow !== 1 ? 's' : ''}`;
    if (remainingLow === 0) return `up to ~${fmt(remainingHigh)} year${remainingHigh !== 1 ? 's' : ''}`;
    return `~${fmt(remainingLow)}–${fmt(remainingHigh)} years`;
}

/**
 * Per-capita intake: animals per 100 residents.
 */
export function getPerCapitaIntake(intake: number, population: number | null): number | null {
    if (!population || population === 0 || intake === 0) return null;
    return Math.round((intake / population) * 100 * 100) / 100; // two decimals
}

/**
 * Year-over-year save-rate trend.
 * Returns { direction: 'up' | 'down' | 'flat', delta: number } or null.
 */
export function getYoYTrend(
    currentIntake: number,
    currentEuthanized: number,
    priorIntake: number | null,
    priorEuthanized: number | null,
): { direction: 'up' | 'down' | 'flat'; delta: number } | null {
    if (!priorIntake || !priorEuthanized || priorIntake === 0 || currentIntake === 0) return null;
    const currentSaveRate = ((currentIntake - currentEuthanized) / currentIntake) * 100;
    const priorSaveRate = ((priorIntake - priorEuthanized) / priorIntake) * 100;
    const delta = Math.round((currentSaveRate - priorSaveRate) * 10) / 10;
    const direction = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
    return { direction, delta };
}

/**
 * Return-to-owner rate as a percentage of intake.
 */
export function getRtoRate(returned: number | null, intake: number): number | null {
    if (returned === null || intake === 0) return null;
    return Math.round((returned / intake) * 1000) / 10; // one decimal
}

/**
 * Transfer rate (to rescues) as a percentage of intake.
 */
export function getTransferRate(transferred: number | null, intake: number): number | null {
    if (transferred === null || intake === 0) return null;
    return Math.round((transferred / intake) * 1000) / 10; // one decimal
}

/**
 * Detect significant discrepancy between shelter-reported and CV-estimated ages.
 * Returns null if no discrepancy or insufficient data.
 */
export function getAgeDiscrepancy(
    shelterAge: number | null,
    cvLow: number | null,
    cvHigh: number | null,
    cvConfidence: string,
): { severity: 'major' | 'minor'; message: string; shelterAge: number; cvRange: string } | null {
    if (shelterAge === null || cvLow === null || cvHigh === null) return null;
    if (cvConfidence === 'NONE' || cvConfidence === 'LOW') return null;

    const cvMid = (cvLow + cvHigh) / 2;
    const gap = Math.abs(shelterAge - cvMid);
    const cvRange = `${cvLow}–${cvHigh}`;

    // Shelter says older than CV thinks
    if (shelterAge > cvHigh + 2) {
        return {
            severity: gap >= 5 ? 'major' : 'minor',
            message: `Shelter lists ${shelterAge} yrs, but photo analysis estimates ${cvRange} yrs — this animal may be younger than reported.`,
            shelterAge,
            cvRange,
        };
    }

    // Shelter says younger than CV thinks
    if (shelterAge < cvLow - 2) {
        return {
            severity: gap >= 5 ? 'major' : 'minor',
            message: `Shelter lists ${shelterAge} yrs, but photo analysis estimates ${cvRange} yrs — this animal may be older than reported.`,
            shelterAge,
            cvRange,
        };
    }

    return null;
}

/**
 * Format a scheduled date as a readable string.
 * e.g., "Monday 2/20 @ 8:00am"
 * Uses browser locale for timezone. This is a client-side formatter.
 */
export function formatScheduledDate(date: Date | string | null): string {
    if (!date) return 'Unknown';
    const d = new Date(date);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const time = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).toLowerCase();
    return `${dayName} ${month}/${day} @ ${time}`;
}

/**
 * Format an intake date as a readable string (date only, no time).
 * e.g., "Monday 2/20"
 */
export function formatIntakeDate(date: Date | string | null): string | null {
    if (!date) return null;
    const d = new Date(date);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${dayName} ${month}/${day}`;
}

/**
 * Get the best available age estimate in years.
 * Priority: shelter-reported → CV midpoint → null
 */
export function getBestAge(
    knownYears: number | null,
    estimatedLow: number | null,
    estimatedHigh: number | null,
    ageSource: string,
): { age: number; source: 'shelter' | 'estimated' } | null {
    if (ageSource === 'SHELTER_REPORTED' && knownYears !== null) {
        return { age: knownYears, source: 'shelter' };
    }
    if (estimatedLow !== null && estimatedHigh !== null) {
        return { age: Math.round((estimatedLow + estimatedHigh) / 2), source: 'estimated' };
    }
    if (knownYears !== null) {
        return { age: knownYears, source: 'shelter' };
    }
    return null;
}

/**
 * Calculate "life cut short" — how many years/months of life
 * the animal would lose if euthanized on the scheduled date.
 * Returns a human-readable string like "~3 years, 2 months" or null.
 */

/** Health keywords scanned from listing/health notes */
const HIGH_SEVERITY_KEYWORDS = ['heartworm', 'fiv', 'felv', 'cancer', 'tumor', 'parvo', 'distemper', 'amputation', 'kidney failure', 'liver failure'];
const MOD_SEVERITY_KEYWORDS = ['diabetes', 'arthritis', 'blind', 'deaf', 'seizure', 'thyroid', 'kidney', 'dental', 'mange', 'ringworm', 'lyme', 'hip dysplasia', 'luxating patella', 'incontinence', 'allergies'];

/** Extract medical conditions from free-text notes */
function extractNoteConditions(notes: string | null, healthNotes: string | null): { high: string[]; moderate: string[] } {
    const text = ((notes || '') + ' ' + (healthNotes || '')).toLowerCase();
    if (!text.trim()) return { high: [], moderate: [] };

    const high = HIGH_SEVERITY_KEYWORDS.filter(kw => text.includes(kw));
    const moderate = MOD_SEVERITY_KEYWORDS.filter(kw => text.includes(kw));
    return { high, moderate };
}

/** Capitalize a keyword for display */
function formatConditionLabel(kw: string): string {
    const special: Record<string, string> = { fiv: 'FIV', felv: 'FeLV' };
    if (special[kw]) return special[kw];
    return kw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export interface HealthSubScore {
    score: number;
    max: number;
    label: string;
    factors: string[];
}

export interface HealthResult {
    score: number;
    label: string;
    factors: string[];
    subScores: {
        physical: HealthSubScore;
        medical: HealthSubScore;
        comfort: HealthSubScore;
    };
    noteConditions: string[]; // merged list for tags
}

/**
 * Compute an overall health score (0–100) with sub-score breakdown.
 *
 * Budget: Physical 45pts · Medical 25pts · Behavioral 30pts
 *
 * Optional context enriches the score:
 *   - notes/healthNotes: scanned for medical keywords
 *   - ageYears: age-adjusted bonuses for seniors in good condition
 *   - breedCommonConditions: reduces deductions for breed-typical conditions
 *
 * Returns null if no health data is available at all.
 */
export function computeHealthScore(
    bodyConditionScore: number | null,
    coatCondition: string | null,
    visibleConditions: string[],
    stressLevel: string | null,
    fearIndicators: string[],
    estimatedCareLevel: string | null,
    options?: {
        notes?: string | null;
        healthNotes?: string | null;
        ageYears?: number | null;
        breedCommonConditions?: string[];
    },
): HealthResult | null {
    const opts = options || {};

    // Need at least one signal to produce a score
    const hasAnyData = bodyConditionScore !== null
        || coatCondition !== null
        || visibleConditions.length > 0
        || stressLevel !== null
        || fearIndicators.length > 0
        || estimatedCareLevel !== null;
    if (!hasAnyData) return null;

    const breedConditions = (opts.breedCommonConditions || []).map(c => c.toLowerCase());

    // ════════════════════════════════════════════
    // PHYSICAL SUB-SCORE (45 pts max)
    //   BCS: 30pts · Coat: 10pts · Age bonus: 5pts
    // ════════════════════════════════════════════
    let physicalPts = 0;
    const physicalFactors: string[] = [];

    // ── BCS (30 pts) ──
    if (bodyConditionScore !== null) {
        const bcsPts = bodyConditionScore >= 4 && bodyConditionScore <= 5 ? 30
            : bodyConditionScore === 3 || bodyConditionScore === 6 ? 24
                : bodyConditionScore === 2 || bodyConditionScore === 7 ? 15
                    : 6;
        physicalPts += bcsPts;
        const bcsLabel = bcsPts >= 30 ? 'Ideal' : bcsPts >= 24 ? 'Good' : bcsPts >= 15 ? 'Slightly off' : 'Concerning';
        physicalFactors.push(`Body condition: ${bcsLabel} (${bodyConditionScore}/9)`);
    } else {
        physicalPts += 22; // neutral default
        physicalFactors.push('Body condition: Not assessed');
    }

    // ── Coat (10 pts) ──
    if (coatCondition === 'good') { physicalPts += 10; }
    else if (coatCondition === 'fair') { physicalPts += 6; physicalFactors.push('Coat: Fair'); }
    else if (coatCondition === 'poor') { physicalPts += 2; physicalFactors.push('Coat: Poor'); }
    else { physicalPts += 7; }

    // ── Age bonus (5 pts) ──
    if (opts.ageYears !== null && opts.ageYears !== undefined) {
        if (opts.ageYears >= 12 && bodyConditionScore !== null && bodyConditionScore >= 4 && bodyConditionScore <= 5) {
            physicalPts += 5;
            physicalFactors.push('Age bonus: Ideal condition at 12+ years');
        } else if (opts.ageYears >= 10 && coatCondition === 'good') {
            physicalPts += 3;
            physicalFactors.push('Age bonus: Good coat at 10+ years');
        }
    }

    const physicalMax = 45;
    const physicalClamped = Math.min(physicalMax, physicalPts);
    const physicalLabel = physicalClamped >= 38 ? 'Excellent' : physicalClamped >= 28 ? 'Good' : physicalClamped >= 18 ? 'Fair' : 'Concerning';

    // ════════════════════════════════════════════
    // MEDICAL SUB-SCORE (25 pts max)
    //   Visible conditions: 15pts · Note keywords: 10pts
    // ════════════════════════════════════════════
    let medicalPts = 25; // start full, deduct
    const medicalFactors: string[] = [];

    // ── Visible conditions (15 pts pool) ──
    if (visibleConditions.length === 0) {
        medicalFactors.push('No visible health concerns detected');
    } else {
        let visDeduction = 0;
        for (const condition of visibleConditions) {
            const isBreedTypical = breedConditions.some(bc => condition.toLowerCase().includes(bc) || bc.includes(condition.toLowerCase()));
            if (isBreedTypical) {
                visDeduction += 2; // reduced deduction for breed-typical
                medicalFactors.push(`${condition} (common for breed)`);
            } else {
                visDeduction += 4;
            }
        }
        medicalPts -= Math.min(15, visDeduction);
        if (medicalFactors.length === 0) {
            medicalFactors.push(`Visible observations: ${visibleConditions.join(', ')}`);
        }
    }

    // ── Note keywords (10 pts pool) ──
    const noteFindings = extractNoteConditions(opts.notes ?? null, opts.healthNotes ?? null);
    const allNoteConditions: string[] = [];
    if (noteFindings.high.length > 0) {
        const deduction = Math.min(8, noteFindings.high.length * 4);
        medicalPts -= deduction;
        for (const kw of noteFindings.high) {
            const label = formatConditionLabel(kw);
            allNoteConditions.push(label);
            medicalFactors.push(`⚠ ${label} (from listing notes)`);
        }
    }
    if (noteFindings.moderate.length > 0) {
        const deduction = Math.min(6, noteFindings.moderate.length * 2);
        medicalPts -= deduction;
        for (const kw of noteFindings.moderate) {
            const label = formatConditionLabel(kw);
            allNoteConditions.push(label);
            medicalFactors.push(`${label} (from listing notes)`);
        }
    }
    if (noteFindings.high.length === 0 && noteFindings.moderate.length === 0 && visibleConditions.length === 0) {
        medicalFactors.push('No medical flags detected');
    }

    const medicalClamped = Math.max(0, Math.min(25, medicalPts));
    const medicalLabel = medicalClamped >= 22 ? 'Clear' : medicalClamped >= 15 ? 'Minor flags' : medicalClamped >= 8 ? 'Moderate' : 'Significant';

    // Merge all conditions for tags (CV + notes, deduped), with normalization
    const normalizeTag = (raw: string): string => {
        let s = raw.trim();
        // Strip leading "possible ", "likely ", "mild ", "slight ", "appears to have "
        s = s.replace(/^(possible|likely|mild|slight|appears to have|seems to have|evidence of|signs of)\s+/i, '');
        // Strip trailing location qualifiers like "on left eye", "in rear leg", "on lower right leg/paw"
        s = s.replace(/\s+(on|in|of|at|near|around)\s+(the\s+)?(left|right|upper|lower|rear|front|hind|back)[\w\s/]*$/i, '');
        // Strip leading "mark ", "spot ", "area " if followed by location
        s = s.replace(/^(mark|spot|area|patch|lesion)\s+(on|in|of)\s+/i, '');
        // If still has "on/in" location at end, strip it
        s = s.replace(/\s+(on|in)\s+[\w\s/]+$/i, '');
        // Title case
        s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        // Cap length
        if (s.length > 30) s = s.slice(0, 28) + '…';
        return s;
    };
    const cvNormalized = visibleConditions.map(normalizeTag);
    const cvLower = cvNormalized.map(c => c.toLowerCase());
    const noteConditions = [
        ...cvNormalized,
        ...allNoteConditions.filter(nc => !cvLower.includes(nc.toLowerCase())),
    ];

    // ════════════════════════════════════════════
    // SHELTER COMFORT SUB-SCORE (30 pts max)
    //   Stress/fear: 20pts · Care level: 10pts
    //   Measures the animal's current state in a shelter
    //   environment — NOT a reflection of temperament.
    // ════════════════════════════════════════════
    let comfortPts = 0;
    const comfortFactors: string[] = [];

    // ── Stress & Fear (20 pts) ──
    let stressPts = 15; // default moderate
    if (stressLevel === 'low') stressPts = 20;
    else if (stressLevel === 'moderate') stressPts = 14;
    else if (stressLevel === 'high') stressPts = 6;
    stressPts = Math.max(0, stressPts - fearIndicators.length * 3);
    comfortPts += stressPts;

    if (stressLevel) {
        comfortFactors.push(`Shelter stress: ${stressLevel}${fearIndicators.length > 0 ? ` · Fear signals: ${fearIndicators.join(', ')}` : ''}`);
    } else if (fearIndicators.length > 0) {
        comfortFactors.push(`Fear signals in photo: ${fearIndicators.join(', ')}`);
    } else {
        comfortFactors.push('Stress: Not assessed');
    }

    // ── Care Level (10 pts) ──
    if (estimatedCareLevel === 'low') { comfortPts += 10; }
    else if (estimatedCareLevel === 'moderate') { comfortPts += 6; comfortFactors.push('Estimated care: Moderate'); }
    else if (estimatedCareLevel === 'high') { comfortPts += 2; comfortFactors.push('Estimated care: High'); }
    else { comfortPts += 6; }

    const comfortClamped = Math.min(30, comfortPts);
    const comfortLabel = comfortClamped >= 25 ? 'Settled' : comfortClamped >= 16 ? 'Adjusting' : comfortClamped >= 8 ? 'Stressed' : 'Unsettled';

    // ════════════════════════════════════════════
    // TOTAL
    // ════════════════════════════════════════════
    const total = Math.max(0, Math.min(100, physicalClamped + medicalClamped + comfortClamped));

    let label: string;
    if (total >= 85) label = 'Excellent';
    else if (total >= 70) label = 'Good';
    else if (total >= 50) label = 'Fair';
    else if (total >= 30) label = 'Needs Attention';
    else label = 'Concerning';

    const factors = [...physicalFactors, ...medicalFactors, ...comfortFactors];

    return {
        score: total,
        label,
        factors,
        subScores: {
            physical: { score: physicalClamped, max: physicalMax, label: physicalLabel, factors: physicalFactors },
            medical: { score: medicalClamped, max: 25, label: medicalLabel, factors: medicalFactors },
            comfort: { score: comfortClamped, max: 30, label: comfortLabel, factors: comfortFactors },
        },
        noteConditions,
    };
}

export function formatLifeCutShort(
    knownYears: number | null,
    estimatedLow: number | null,
    estimatedHigh: number | null,
    ageSource: string,
    lifeExpLow: number | null,
    lifeExpHigh: number | null,
    euthDate: Date | string | null,
): string | null {
    const bestAge = getBestAge(knownYears, estimatedLow, estimatedHigh, ageSource);
    if (!bestAge) return null;
    if (lifeExpLow === null || lifeExpHigh === null) return null;

    const lifeExpMid = (lifeExpLow + lifeExpHigh) / 2;
    const remainingYears = lifeExpMid - bestAge.age;
    if (remainingYears <= 0) return null;

    // Subtract time until euthanasia (usually tiny, days/weeks)
    let euthOffsetYears = 0;
    if (euthDate) {
        const d = new Date(euthDate);
        const now = new Date();
        const diffMs = d.getTime() - now.getTime();
        if (diffMs > 0) {
            euthOffsetYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
        }
    }

    const cutShort = remainingYears - euthOffsetYears;
    if (cutShort <= 0) return null;

    const years = Math.floor(cutShort);
    const months = Math.round((cutShort - years) * 12);

    if (years === 0 && months === 0) return null;
    if (years === 0) return `~${months} month${months !== 1 ? 's' : ''}`;
    if (months === 0) return `~${years} year${years !== 1 ? 's' : ''}`;
    return `~${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`;
}
