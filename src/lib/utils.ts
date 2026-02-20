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
            return `~${estimatedLow}–${estimatedHigh} yrs`;
        }
        if (confidence === 'MEDIUM') {
            return `Likely senior · ~${estimatedLow}–${estimatedHigh} yrs`;
        }
        return `Possibly senior · age uncertain`;
    }
    return 'Age unknown';
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

    const remainingLow = Math.max(0, lifeExpLow - currentAge);
    const remainingHigh = Math.max(0, lifeExpHigh - currentAge);

    if (remainingHigh === 0) return 'near end of life';
    if (remainingLow === remainingHigh) return `~${remainingLow} year${remainingLow !== 1 ? 's' : ''}`;
    return `${remainingLow}–${remainingHigh} years`;
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
