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
 * Get trust score color class
 */
export function getTrustScoreLevel(score: number | null): 'good' | 'moderate' | 'poor' {
    if (score === null) return 'moderate';
    if (score < 30) return 'good';
    if (score <= 60) return 'moderate';
    return 'poor';
}

/**
 * Format age display with confidence if CV-estimated
 */
export function formatAge(
    knownYears: number | null,
    estimatedLow: number | null,
    estimatedHigh: number | null,
    confidence: number | null,
    source: string
): string {
    if (source === 'SHELTER_REPORTED' && knownYears !== null) {
        return `${knownYears} yr${knownYears !== 1 ? 's' : ''}`;
    }
    if (source === 'CV_ESTIMATED' && estimatedLow !== null && estimatedHigh !== null) {
        const conf = confidence !== null ? ` (${Math.round(confidence * 100)}% conf.)` : '';
        return `~${estimatedLow}–${estimatedHigh} yrs${conf}`;
    }
    return 'Age unknown';
}

/**
 * Calculate trust score from intake/euthanized numbers
 */
export function calculateTrustScore(totalIntake: number, totalEuthanized: number): number | null {
    if (totalIntake === 0) return null;
    return Math.round((totalEuthanized / totalIntake) * 100);
}
