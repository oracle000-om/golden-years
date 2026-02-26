'use client';

import { useState, useMemo } from 'react';
import type { Animal } from '@/lib/types';
import {
    getBestAge, getAvgBodyCondition, getDentalDiseaseRate, getCataractRate,
    getCareLevelDistribution, getYearsRemainingBuckets, getLongestStay, getReentryCount,
} from '@/lib/utils';

interface SeniorCensusProps {
    animals: Animal[];
}

type SpeciesFilter = 'ALL' | 'DOG' | 'CAT';

function computeAvgDaysInShelter(animals: Animal[]): number | null {
    const withDays = animals.filter((a) => a.intakeDate);
    if (withDays.length === 0) return null;
    const now = Date.now();
    const total = withDays.reduce((sum, a) => {
        const days = Math.max(0, Math.floor((now - new Date(a.intakeDate!).getTime()) / 86_400_000));
        return sum + days;
    }, 0);
    return Math.round(total / withDays.length);
}

export function SeniorCensus({ animals }: SeniorCensusProps) {
    const [filter, setFilter] = useState<SpeciesFilter>('ALL');

    const dogCount = animals.filter((a) => a.species === 'DOG').length;
    const catCount = animals.filter((a) => a.species === 'CAT').length;
    const otherCount = animals.filter((a) => a.species === 'OTHER').length;
    const hasBoth = dogCount > 0 && catCount > 0;

    const filtered = filter === 'ALL' ? animals : animals.filter((a) => a.species === filter);

    // Recompute aggregates whenever filter changes
    const stats = useMemo(() => {
        const avgBcs = getAvgBodyCondition(filtered);
        const dentalRate = getDentalDiseaseRate(filtered);
        const cataractRate = getCataractRate(filtered);
        const careLevels = getCareLevelDistribution(filtered);
        const yearsBuckets = getYearsRemainingBuckets(filtered);
        const longestStay = getLongestStay(filtered);
        const reentryCount = getReentryCount(filtered);
        const avgDays = computeAvgDaysInShelter(filtered);
        const hasHealthData = avgBcs !== null || dentalRate !== null || cataractRate !== null || careLevels.total > 0;

        const agesWithData = filtered
            .map(a => getBestAge(a.ageKnownYears, a.ageEstimatedLow, a.ageEstimatedHigh))
            .filter((a): a is NonNullable<ReturnType<typeof getBestAge>> => a !== null);
        const avgAge = agesWithData.length > 0
            ? Math.round((agesWithData.reduce((s, a) => s + a.age, 0) / agesWithData.length) * 10) / 10
            : null;

        return { avgBcs, dentalRate, cataractRate, careLevels, yearsBuckets, longestStay, reentryCount, avgDays, hasHealthData, avgAge };
    }, [filtered]);

    const chipClass = (species: SpeciesFilter) =>
        `report-card__species-chip${filter === species ? ' report-card__species-chip--active' : ''}`;

    return (
        <details className="report-card__section" open>
            <summary className="report-card__section-header">
                <span className="report-card__section-icon">🐾</span>
                <span className="report-card__section-title">Senior Census & Health</span>
                <span className="report-card__chevron">▸</span>
            </summary>
            <div className="report-card__section-body">
                {/* Species filter tabs — only show when shelter has both dogs and cats */}
                {hasBoth && (
                    <div className="report-card__species-filter">
                        <button className={chipClass('ALL')} onClick={() => setFilter('ALL')}>
                            All ({animals.length})
                        </button>
                        <button className={chipClass('DOG')} onClick={() => setFilter('DOG')}>
                            🐕 Dogs ({dogCount})
                        </button>
                        <button className={chipClass('CAT')} onClick={() => setFilter('CAT')}>
                            🐈 Cats ({catCount})
                        </button>
                    </div>
                )}

                {/* Census row */}
                <div className="report-card__stats-grid">
                    {filter === 'ALL' && dogCount > 0 && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">🐕 {dogCount}</span>
                            <span className="report-card__stat-label">{dogCount === 1 ? 'Dog' : 'Dogs'}</span>
                        </div>
                    )}
                    {filter === 'ALL' && catCount > 0 && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">🐈 {catCount}</span>
                            <span className="report-card__stat-label">{catCount === 1 ? 'Cat' : 'Cats'}</span>
                        </div>
                    )}
                    {filter === 'ALL' && otherCount > 0 && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">🐾 {otherCount}</span>
                            <span className="report-card__stat-label">Other</span>
                        </div>
                    )}
                    {filter !== 'ALL' && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">{filtered.length}</span>
                            <span className="report-card__stat-label">
                                {filter === 'DOG' ? (filtered.length === 1 ? 'Dog' : 'Dogs') : (filtered.length === 1 ? 'Cat' : 'Cats')}
                            </span>
                        </div>
                    )}
                    {stats.avgAge !== null && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">{stats.avgAge}</span>
                            <span className="report-card__stat-label">Avg. Est. Age (yrs)</span>
                        </div>
                    )}
                    {stats.avgDays !== null && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">{stats.avgDays}</span>
                            <span className="report-card__stat-label">Avg. Days Waiting</span>
                        </div>
                    )}
                    {stats.longestStay !== null && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">{stats.longestStay}</span>
                            <span className="report-card__stat-label">Longest Stay (days)</span>
                        </div>
                    )}
                    {stats.reentryCount > 0 && (
                        <div className="report-card__stat">
                            <span className="report-card__stat-value">{stats.reentryCount}</span>
                            <span className="report-card__stat-label">Re-entries</span>
                        </div>
                    )}
                </div>

                {/* Population Health */}
                {stats.hasHealthData && (
                    <div className="report-card__health">
                        <h4 className="report-card__subsection-title">Population Health</h4>
                        <div className="report-card__health-grid">
                            {stats.avgBcs !== null && (
                                <div className="report-card__health-item">
                                    <span className="report-card__health-value">{stats.avgBcs} <small>/ 9</small></span>
                                    <span className="report-card__health-label">Avg. Body Condition</span>
                                    <span className="report-card__health-hint">4–5 is ideal</span>
                                </div>
                            )}
                            {stats.dentalRate !== null && (
                                <div className="report-card__health-item">
                                    <span className="report-card__health-value">{stats.dentalRate.pct}%</span>
                                    <span className="report-card__health-label">Dental Disease</span>
                                    <span className="report-card__health-hint">{stats.dentalRate.count} of {stats.dentalRate.total} assessed</span>
                                </div>
                            )}
                            {stats.cataractRate !== null && (
                                <div className="report-card__health-item">
                                    <span className="report-card__health-value">{stats.cataractRate.pct}%</span>
                                    <span className="report-card__health-label">Cataracts Detected</span>
                                    <span className="report-card__health-hint">{stats.cataractRate.count} of {stats.cataractRate.total} assessed</span>
                                </div>
                            )}
                            {stats.careLevels.total > 0 && (
                                <div className="report-card__health-item">
                                    <div className="report-card__care-bars">
                                        {stats.careLevels.low > 0 && (
                                            <span className="report-card__care-bar report-card__care-bar--low"
                                                style={{ flex: stats.careLevels.low }}>
                                                {Math.round((stats.careLevels.low / stats.careLevels.total) * 100)}%
                                            </span>
                                        )}
                                        {stats.careLevels.moderate > 0 && (
                                            <span className="report-card__care-bar report-card__care-bar--mod"
                                                style={{ flex: stats.careLevels.moderate }}>
                                                {Math.round((stats.careLevels.moderate / stats.careLevels.total) * 100)}%
                                            </span>
                                        )}
                                        {stats.careLevels.high > 0 && (
                                            <span className="report-card__care-bar report-card__care-bar--high"
                                                style={{ flex: stats.careLevels.high }}>
                                                {Math.round((stats.careLevels.high / stats.careLevels.total) * 100)}%
                                            </span>
                                        )}
                                    </div>
                                    <span className="report-card__health-label">Estimated Care Level</span>
                                    <span className="report-card__health-hint">
                                        <span className="report-card__legend-dot report-card__legend-dot--low"></span> Low
                                        <span className="report-card__legend-dot report-card__legend-dot--mod"></span> Moderate
                                        <span className="report-card__legend-dot report-card__legend-dot--high"></span> High
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Years Remaining Distribution */}
                {stats.yearsBuckets !== null && (
                    <div className="report-card__years">
                        <h4 className="report-card__subsection-title">Estimated Golden Years Remaining</h4>
                        <div className="report-card__years-chart">
                            {[
                                { label: '< 1 yr', count: stats.yearsBuckets.under1 },
                                { label: '1–2 yrs', count: stats.yearsBuckets.oneToTwo },
                                { label: '2–4 yrs', count: stats.yearsBuckets.twoToFour },
                                { label: '4+ yrs', count: stats.yearsBuckets.fourPlus },
                            ].map((b) => (
                                <div key={b.label} className="report-card__years-row">
                                    <span className="report-card__years-label">{b.label}</span>
                                    <div className="report-card__years-track">
                                        <div
                                            className="report-card__years-fill"
                                            style={{ width: `${stats.yearsBuckets!.total > 0 ? (b.count / stats.yearsBuckets!.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                    <span className="report-card__years-pct">
                                        {stats.yearsBuckets!.total > 0 ? Math.round((b.count / stats.yearsBuckets!.total) * 100) : 0}%
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="report-card__explainer">
                            Based on breed life expectancy and estimated age. {stats.yearsBuckets.total} of {filtered.length} animals assessed.
                        </p>
                    </div>
                )}
            </div>
        </details>
    );
}
