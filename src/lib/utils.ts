/**
 * Normalize ALL-CAPS text to Title Case, preserving small words.
 * Already mixed-case text (containing at least one lowercase letter) is left untouched.
 */
export function toTitleCase(str: string): string {
    if (!str) return str;
    // If string is already mixed-case, leave it as-is
    if (str !== str.toUpperCase()) return str;
    const small = new Set(['of', 'the', 'and', 'in', 'at', 'for', 'to', 'a', 'an', 'on']);
    return str
        .toLowerCase()
        .split(/(\s+|-(?=[a-z]))/)
        .map((word, i) => {
            if (/^\s+$/.test(word) || word === '-') return word;
            if (i > 0 && small.has(word)) return word;
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join('');
}

/**
 * Format shelter location for display.
 * Filters out placeholder values like "Unknown" county and "US" state.
 */
export function formatShelterLocation(
    shelter: { county?: string | null; state?: string | null; zipCode?: string | null },
    opts: { titleCase?: boolean; includeZip?: boolean; countySuffix?: boolean } = {},
): string {
    const { titleCase: tc, includeZip, countySuffix = true } = opts;
    const parts: string[] = [];
    if (shelter.county && shelter.county.toLowerCase() !== 'unknown') {
        const county = tc ? toTitleCase(shelter.county) : shelter.county;
        parts.push(countySuffix ? `${county} County` : county);
    }
    if (shelter.state && shelter.state.length === 2 && shelter.state !== 'US') {
        parts.push(shelter.state);
    }
    if (includeZip && shelter.zipCode) {
        parts.push(shelter.zipCode);
    }
    return parts.join(', ');
}

/**
 * Build a Google Maps search URL for a shelter's address.
 */
export function buildShelterMapUrl(
    shelter: { latitude?: number | null; longitude?: number | null; address?: string | null; county?: string | null; state?: string | null },
): string | null {
    if (shelter.latitude && shelter.longitude) {
        return `https://www.google.com/maps/search/?api=1&query=${shelter.latitude},${shelter.longitude}`;
    }
    if (shelter.address) {
        const addrParts = [shelter.address];
        if (shelter.county && shelter.county.toLowerCase() !== 'unknown') addrParts.push(`${shelter.county} County`);
        if (shelter.state && shelter.state.length === 2 && shelter.state !== 'US') addrParts.push(shelter.state);
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrParts.join(', '))}`;
    }
    return null;
}

/**
 * Clean text for display — decodes HTML entities, fixes mojibake, strips tags.
 * Use at render time for text already stored in the database.
 *
 * Order matters: HTML entities (&#226;) must be decoded BEFORE mojibake
 * repair, because the garbled â character is often stored as &#226;.
 */
export function cleanDisplayText(text: string | null): string | null {
    if (!text) return null;
    let s = text;

    // ── Step 1: Decode HTML entities (must come before mojibake repair) ──
    // Named entities
    const entities: Record<string, string> = {
        '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
        '&quot;': '"', '&apos;': "'", '&mdash;': '\u2014', '&ndash;': '\u2013',
        '&hellip;': '...', '&bull;': '\u2022', '&ldquo;': '"', '&rdquo;': '"',
        '&lsquo;': "'", '&rsquo;': "'",
    };
    s = s.replace(/&[a-zA-Z]+;/g, (e) => entities[e.toLowerCase()] ?? e);
    // Numeric entities: &#226; &#8364; etc.
    s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
    s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));

    // ── Step 2: Fix mojibake (UTF-8 bytes misinterpreted as single-byte) ──
    const mojibake: [string, string][] = [
        // ISO-8859-1 variant (raw bytes as code points)
        ['\u00e2\u0080\u0099', "'"],   // ' right single quote
        ['\u00e2\u0080\u0098', "'"],   // ' left single quote
        ['\u00e2\u0080\u009c', '"'],   // " left double quote
        ['\u00e2\u0080\u009d', '"'],   // " right double quote
        ['\u00e2\u0080\u0093', '-'],   // – en dash
        ['\u00e2\u0080\u0094', '-'],   // — em dash
        ['\u00e2\u0080\u00a6', '...'], // … ellipsis
        ['\u00e2\u0080\u00a2', '\u2022'], // • bullet
        ['\u00e2\u0084\u00a2', '\u2122'], // ™
        ['\u00c2\u00b0', '\u00b0'],    // °
        ['\u00c2\u00a0', ' '],         // non-breaking space
        ['\u00e2\u009c\u00a8', '\u2728'], // ✨
        // Windows-1252 variant (bytes 0x80-0x9F → Win-1252 Unicode chars)
        ['\u00e2\u20ac\u2122', "'"],   // â€™ → '
        ['\u00e2\u20ac\u02dc', "'"],   // â€˜ → '
        ['\u00e2\u20ac\u0153', '"'],   // â€œ → "
        ['\u00e2\u20ac\u009d', '"'],   // â€ → "
        ['\u00e2\u20ac\u201c', '-'],   // â€" → –
        ['\u00e2\u20ac\u201d', '-'],   // â€" → —
        ['\u00e2\u20ac\u00a6', '...'], // â€¦ → …
        ['\u00e2\u20ac\u00a2', '\u2022'], // â€¢ → •
        ['\u00e2\u0153\u00a8', '\u2728'], // âœ¨ → ✨
        // ASCII quote variant (0x94/0x93 decoded as plain " U+0022)
        ['\u00e2\u20ac"', '-'],            // â€" → em/en dash (with plain ASCII quote)
    ];
    for (const [from, to] of mojibake) {
        s = s.split(from).join(to);
    }

    // ── Step 3: Normalize remaining smart punctuation to ASCII ──
    s = s.replace(/[\u2018\u2019\u201a\u201b]/g, "'");
    s = s.replace(/[\u201c\u201d\u201e\u201f]/g, '"');
    s = s.replace(/\u2013|\u2014/g, '-');
    s = s.replace(/\u2026/g, '...');

    // ── Step 4: Strip HTML tags ──
    s = s.replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');

    // ── Step 5: Collapse whitespace ──
    s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return s || null;
}

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
 *
 * Uses range-against-range computation instead of collapsing to a
 * midpoint. When both shelter age and CV estimates exist, takes the
 * union (widest range) to be honest about uncertainty.
 *
 * Options:
 *   short — true: abbreviate units as "yrs" (cards/detail grid)
 *           false: spell out "years" (report card prose)
 */
export function formatYearsRemaining(
    ageKnownYears: number | null,
    ageEstimatedLow: number | null,
    ageEstimatedHigh: number | null,
    lifeExpLow: number | null,
    lifeExpHigh: number | null,
    options?: { short?: boolean },
): string | null {
    if (lifeExpLow === null || lifeExpHigh === null) return null;

    // Build the best age range from all available data
    let ageLow: number | null = null;
    let ageHigh: number | null = null;

    if (ageKnownYears !== null && ageEstimatedLow !== null && ageEstimatedHigh !== null) {
        // Both sources: union (widest range) for maximum honesty
        ageLow = Math.min(ageKnownYears, ageEstimatedLow);
        ageHigh = Math.max(ageKnownYears, ageEstimatedHigh);
    } else if (ageEstimatedLow !== null && ageEstimatedHigh !== null) {
        ageLow = ageEstimatedLow;
        ageHigh = ageEstimatedHigh;
    } else if (ageKnownYears !== null) {
        ageLow = ageKnownYears;
        ageHigh = ageKnownYears;
    }

    if (ageLow === null || ageHigh === null) return null;

    // Range-against-range: best case vs worst case
    const roundHalf = (n: number) => Math.round(n * 2) / 2;
    const remainingLow = roundHalf(Math.max(0, lifeExpLow - ageHigh));   // worst case
    const remainingHigh = roundHalf(Math.max(0, lifeExpHigh - ageLow));  // best case

    const fmt = (n: number) => `${n}`;
    const short = options?.short ?? false;
    const unit = (n: number) => short
        ? (n === 1 ? 'yr' : 'yrs')
        : (n === 1 ? 'year' : 'years');

    if (remainingHigh === 0) return 'near end of life';
    if (remainingLow === remainingHigh) return `~${fmt(remainingLow)} ${unit(remainingLow)}`;
    if (remainingLow === 0) return `~0–${fmt(remainingHigh)} ${unit(remainingHigh)}`;
    return `~${fmt(remainingLow)}–${fmt(remainingHigh)} ${unit(remainingHigh)}`;
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
 * e.g., "Monday 2/20/2025"
 */
export function formatIntakeDate(date: Date | string | null): string | null {
    if (!date) return null;
    const d = new Date(date);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();
    return `${dayName} ${month}/${day}/${year}`;
}

/**
 * Get the best available age as a single number.
 * Known age is trusted first (it's a specific number someone attached
 * to this animal). CV midpoint is the fallback.
 *
 * ageSource is no longer used — it's a pipeline artifact, not a
 * quality signal.
 */
export function getBestAge(
    knownYears: number | null,
    estimatedLow: number | null,
    estimatedHigh: number | null,
    _ageSource?: string,
): { age: number; source: 'shelter' | 'estimated' } | null {
    if (knownYears !== null) {
        return { age: knownYears, source: 'shelter' };
    }
    if (estimatedLow !== null && estimatedHigh !== null) {
        return { age: Math.round((estimatedLow + estimatedHigh) / 2), source: 'estimated' };
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

interface HealthSubScore {
    score: number;
    max: number;
    label: string;
    factors: string[];
}

interface HealthResult {
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


// ─── Report Card Helpers ─────────────────────────────────
// Aggregate CV data across a shelter's population for the
// report card. All functions are pure and testable.

interface ReportCardAnimal {
    bodyConditionScore: number | null;
    dentalGrade: number | null;
    cataractStage: string | null;
    estimatedCareLevel: string | null;
    ageKnownYears: number | null;
    ageEstimatedLow: number | null;
    ageEstimatedHigh: number | null;
    lifeExpectancyLow: number | null;
    lifeExpectancyHigh: number | null;
    intakeDate: Date | null;
    shelterEntryCount: number;
}

/**
 * Average body condition score across animals with BCS data.
 * Returns null if no animals have BCS.
 */
export function getAvgBodyCondition(animals: Pick<ReportCardAnimal, 'bodyConditionScore'>[]): number | null {
    const withBcs = animals.filter(a => a.bodyConditionScore !== null);
    if (withBcs.length === 0) return null;
    const sum = withBcs.reduce((s, a) => s + a.bodyConditionScore!, 0);
    return Math.round((sum / withBcs.length) * 10) / 10;
}

/**
 * What percentage of animals have dental disease (grade 2+)?
 */
export function getDentalDiseaseRate(animals: Pick<ReportCardAnimal, 'dentalGrade'>[]): { count: number; total: number; pct: number } | null {
    const withGrade = animals.filter(a => a.dentalGrade !== null);
    if (withGrade.length === 0) return null;
    const diseased = withGrade.filter(a => a.dentalGrade! >= 2);
    return {
        count: diseased.length,
        total: withGrade.length,
        pct: Math.round((diseased.length / withGrade.length) * 100),
    };
}

/**
 * What percentage of animals have cataracts detected?
 */
export function getCataractRate(animals: Pick<ReportCardAnimal, 'cataractStage'>[]): { count: number; total: number; pct: number } | null {
    const withStage = animals.filter(a => a.cataractStage !== null && a.cataractStage !== 'none');
    const assessed = animals.filter(a => a.cataractStage !== null);
    if (assessed.length === 0) return null;
    return {
        count: withStage.length,
        total: assessed.length,
        pct: Math.round((withStage.length / assessed.length) * 100),
    };
}

/**
 * Distribution of estimated care levels.
 */
export function getCareLevelDistribution(animals: Pick<ReportCardAnimal, 'estimatedCareLevel'>[]): { low: number; moderate: number; high: number; total: number } {
    let low = 0, moderate = 0, high = 0;
    for (const a of animals) {
        if (a.estimatedCareLevel === 'low') low++;
        else if (a.estimatedCareLevel === 'moderate') moderate++;
        else if (a.estimatedCareLevel === 'high') high++;
    }
    return { low, moderate, high, total: low + moderate + high };
}

/**
 * Bucket estimated years remaining into 4 groups.
 * Uses lifeExpHigh - bestAge for optimistic estimate.
 */
export function getYearsRemainingBuckets(
    animals: Pick<ReportCardAnimal, 'ageKnownYears' | 'ageEstimatedLow' | 'ageEstimatedHigh' | 'lifeExpectancyLow' | 'lifeExpectancyHigh'>[],
): { under1: number; oneToTwo: number; twoToFour: number; fourPlus: number; total: number } | null {
    const buckets = { under1: 0, oneToTwo: 0, twoToFour: 0, fourPlus: 0, total: 0 };
    for (const a of animals) {
        const best = getBestAge(a.ageKnownYears, a.ageEstimatedLow, a.ageEstimatedHigh);
        if (!best || a.lifeExpectancyHigh === null) continue;
        const remaining = Math.max(0, a.lifeExpectancyHigh - best.age);
        buckets.total++;
        if (remaining < 1) buckets.under1++;
        else if (remaining < 2) buckets.oneToTwo++;
        else if (remaining < 4) buckets.twoToFour++;
        else buckets.fourPlus++;
    }
    return buckets.total > 0 ? buckets : null;
}

/**
 * Longest current stay in days, computed from intakeDate.
 */
export function getLongestStay(animals: Pick<ReportCardAnimal, 'intakeDate'>[]): number | null {
    let max = 0;
    const now = Date.now();
    for (const a of animals) {
        if (!a.intakeDate) continue;
        const days = Math.max(0, Math.floor((now - new Date(a.intakeDate).getTime()) / 86_400_000));
        if (days > max) max = days;
    }
    return max > 0 ? max : null;
}

/**
 * Count animals that are re-entries (shelterEntryCount > 1).
 */
export function getReentryCount(animals: Pick<ReportCardAnimal, 'shelterEntryCount'>[]): number {
    return animals.filter(a => a.shelterEntryCount > 1).length;
}

// ─── Shelter Story Insights ──────────────────────────────
// Fact-based, natural-language insights for the shelter
// detail page. Pulls from shelter stats, financials, state
// policy and live animal inventory.

/** Compact format for dollar amounts: $2.4M, $180K, $950 */
function fmtDollars(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (abs >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
    return `$${n.toLocaleString()}`;
}

export interface StoryInsightsInput {
    shelter: {
        shelterType: string;
        totalIntakeAnnual: number;
        totalEuthanizedAnnual: number;
        dataYear: number | null;
        countyPopulation: number | null;
        totalTransferred: number | null;
        priorYearIntake: number | null;
        priorYearEuthanized: number | null;
        priorDataYear: number | null;
        state: string;
    };
    financials?: {
        taxPeriod: number | null;
        totalRevenue: number | null;
        totalExpenses: number | null;
        contributions: number | null;
        programRevenue: number | null;
        fundraisingExpense: number | null;
        officerCompensation: number | null;
    } | null;
    statePolicy?: {
        holdingPeriodDays: number | null;
        mandatoryReporting: boolean | null;
        reportingBody: string | null;
    } | null;
    /** Average days current animals have been waiting */
    avgDaysWaiting: number | null;
}

/**
 * Generate enriched, fact-based storytelling insights for a shelter.
 *
 * Each insight is a plain string (emoji prefix + natural language).
 * All data is objective — no scores, grades, or judgments.
 * Returns up to 8 insights, ordered by editorial interest.
 */
export function buildShelterStoryInsights(input: StoryInsightsInput): string[] {
    const { shelter, financials, statePolicy, avgDaysWaiting } = input;
    const insights: string[] = [];

    const yearLabel = shelter.dataYear ? ` in ${shelter.dataYear}` : '';

    // ── 1. Save rate context ──
    if (shelter.totalIntakeAnnual > 0 && shelter.totalEuthanizedAnnual >= 0) {
        const saveRate = Math.round(
            ((shelter.totalIntakeAnnual - shelter.totalEuthanizedAnnual) / shelter.totalIntakeAnnual) * 100,
        );
        if (saveRate >= 90) {
            insights.push(`💚 ${saveRate}% live release rate${yearLabel} — above the 90% no-kill benchmark`);
        } else if (saveRate >= 70) {
            insights.push(`📊 ${saveRate}% live release rate${yearLabel}`);
        } else {
            insights.push(`⚠️ ${saveRate}% live release rate${yearLabel} — higher-risk environment for seniors`);
        }
    }

    // ── 2. Intake trend ──
    if (shelter.priorYearIntake && shelter.priorYearIntake > 0 && shelter.totalIntakeAnnual > 0) {
        const delta = shelter.totalIntakeAnnual - shelter.priorYearIntake;
        const pctChange = Math.round((delta / shelter.priorYearIntake) * 100);
        if (pctChange <= -10) {
            insights.push(`📉 Intake dropped ${Math.abs(pctChange)}% since ${shelter.priorDataYear ?? 'prior year'}`);
        } else if (pctChange >= 10) {
            insights.push(`📈 Intake rose ${pctChange}% since ${shelter.priorDataYear ?? 'prior year'}`);
        }
    }

    // ── 3. Euthanasia trend ──
    if (shelter.priorYearEuthanized && shelter.priorYearEuthanized > 0 && shelter.totalEuthanizedAnnual > 0) {
        const delta = shelter.totalEuthanizedAnnual - shelter.priorYearEuthanized;
        const pctChange = Math.round((delta / shelter.priorYearEuthanized) * 100);
        if (pctChange <= -15) {
            insights.push(`🕊️ Euthanasia down ${Math.abs(pctChange)}% year-over-year — positive trend`);
        } else if (pctChange >= 15) {
            insights.push(`⚠️ Euthanasia up ${pctChange}% year-over-year`);
        }
    }

    // ── 4. Transfer partnerships ──
    if (shelter.totalTransferred && shelter.totalIntakeAnnual > 0) {
        const transferPct = Math.round((shelter.totalTransferred / shelter.totalIntakeAnnual) * 100);
        if (transferPct >= 10) {
            insights.push(`🤝 ${transferPct}% of animals are transferred to rescue partners`);
        }
    }

    // ── 5. Per-capita context ──
    if (shelter.countyPopulation && shelter.countyPopulation > 0 && shelter.totalIntakeAnnual > 0) {
        const perCap = Math.round((shelter.totalIntakeAnnual / shelter.countyPopulation) * 100 * 100) / 100;
        if (perCap >= 1.5) {
            insights.push(`📍 Serves a high-intake area — ${perCap} animals per 100 county residents`);
        }
    }

    // ── 6. Senior wait time ──
    if (avgDaysWaiting !== null && avgDaysWaiting > 0) {
        insights.push(`⏱️ Seniors here wait an average of ${avgDaysWaiting} days for adoption`);
    }

    // ── 7. Financial health (shelter detail page only) ──
    if (financials) {
        const { totalRevenue, totalExpenses, fundraisingExpense, contributions } = financials;
        const filingYear = financials.taxPeriod ? ` (${financials.taxPeriod})` : '';

        // Revenue + program spend ratio
        if (totalRevenue && totalExpenses && totalRevenue > 0 && totalExpenses > 0) {
            const programSpend = totalExpenses - (fundraisingExpense ?? 0) - (financials.officerCompensation ?? 0);
            const programPct = Math.round((programSpend / totalExpenses) * 100);
            if (programPct >= 75) {
                insights.push(`💰 Annual revenue of ${fmtDollars(totalRevenue)} with ${programPct}% going to programs${filingYear}`);
            } else {
                insights.push(`💰 Annual revenue of ${fmtDollars(totalRevenue)}${filingYear}`);
            }
        } else if (totalRevenue && totalRevenue > 0) {
            insights.push(`💰 Annual revenue of ${fmtDollars(totalRevenue)}${filingYear}`);
        }

        // Fundraising efficiency
        if (fundraisingExpense && contributions && contributions > 0 && fundraisingExpense > 0) {
            const costPerDollar = Math.round((fundraisingExpense / contributions) * 100);
            if (costPerDollar <= 25) {
                insights.push(`📋 Spends ${costPerDollar}¢ per dollar raised on fundraising`);
            }
        }
    }

    // ── 8. Shelter type context ──
    if (shelter.shelterType === 'FOSTER_BASED') {
        insights.push('🏡 Foster-based rescue — seniors here are living in homes, not kennels');
    } else if (shelter.shelterType === 'NO_KILL') {
        insights.push('💛 This is a no-kill organization');
    } else if (shelter.shelterType === 'RESCUE') {
        insights.push('🤝 This is a rescue — animals here were pulled from other shelters');
    } else if (shelter.shelterType === 'SANCTUARY') {
        insights.push('🏛️ This is a sanctuary — animals here are permanent residents');
    }

    // ── 9. State holding period context ──
    if (statePolicy?.holdingPeriodDays && statePolicy.holdingPeriodDays > 0) {
        const stateNames: Record<string, string> = {
            AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
            CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
            HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
            KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
            MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
            MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
            NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
            OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
            SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
            VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
            DC: 'Washington D.C.',
        };
        const stateName = stateNames[shelter.state] || shelter.state;
        insights.push(`⚖️ ${stateName} requires a ${statePolicy.holdingPeriodDays}-day holding period before euthanasia`);
    }

    return insights.slice(0, 8);
}

/**
 * Recommended minimum home sqft from weight + energy + mobility.
 *
 * Baseline from weight buckets, adjusted by energy level and
 * mobility. Returns null if weight is unknown.
 */
export function getRecommendedMinSqft(
    weightLbs: number | null,
    energyLevel: string | null,
    mobilityAssessment: string | null,
): { sqft: number; label: string } | null {
    if (weightLbs === null) return null;

    // Base sqft from weight
    let sqft: number;
    if (weightLbs <= 15) sqft = 400;   // toy/small
    else if (weightLbs <= 30) sqft = 600;   // small-medium
    else if (weightLbs <= 55) sqft = 800;   // medium
    else if (weightLbs <= 80) sqft = 1000;  // large
    else sqft = 1200;  // XL

    // Energy adjustment
    if (energyLevel === 'high') sqft = Math.round(sqft * 1.3);
    else if (energyLevel === 'low') sqft = Math.round(sqft * 0.7);

    // Mobility — limited/impaired animals need less space
    if (mobilityAssessment === 'limited' || mobilityAssessment === 'impaired') {
        sqft = Math.round(sqft * 0.7);
    }

    // Snap to nearest 50
    sqft = Math.round(sqft / 50) * 50;

    // Human-friendly label
    let label: string;
    if (sqft <= 400) label = 'Studio / small apt';
    else if (sqft <= 600) label = 'Apartment';
    else if (sqft <= 800) label = 'Large apartment';
    else if (sqft <= 1000) label = 'House';
    else label = 'House with yard';

    return { sqft, label };
}
