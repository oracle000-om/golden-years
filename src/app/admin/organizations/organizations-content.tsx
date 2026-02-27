'use client';

import { useState, useMemo } from 'react';
import { DonutChart } from '@/components/donut-chart';
import { Histogram } from '@/components/histogram';
import { AdminQueryTable } from '@/components/admin-query-table';
import type { AdminShelterDetail } from '@/lib/admin-queries';

const TYPE_COLORS: Record<string, string> = {
    MUNICIPAL: '#60a5fa',
    NO_KILL: '#4ade80',
    RESCUE: '#f472b6',
    FOSTER_BASED: '#c084fc',
};

const TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
    all: { emoji: '🏠', label: 'All' },
    MUNICIPAL: { emoji: '🏛️', label: 'Municipal' },
    NO_KILL: { emoji: '🐾', label: 'No Kill' },
    RESCUE: { emoji: '🤝', label: 'Rescue' },
    FOSTER_BASED: { emoji: '🏡', label: 'Foster' },
};

type FilterKey = 'all' | 'MUNICIPAL' | 'NO_KILL' | 'RESCUE' | 'FOSTER_BASED';

export function OrganizationsContent({ allShelters, initialSearch }: { allShelters: AdminShelterDetail[]; initialSearch: string }) {
    const [filter, setFilter] = useState<FilterKey>('all');

    const shelters = useMemo(() => {
        if (filter === 'all') return allShelters;
        return allShelters.filter(s => s.shelterType === filter);
    }, [filter, allShelters]);

    const totalActive = shelters.reduce((sum, s) => sum + s.activeAnimals, 0);
    const withData = shelters.filter(s => s.totalIntakeAnnual > 0);
    const totalIntake = withData.reduce((sum, s) => sum + s.totalIntakeAnnual, 0);
    const totalEuth = withData.reduce((sum, s) => sum + s.totalEuthanizedAnnual, 0);
    const overallSaveRate = totalIntake > 0 ? Math.round(((totalIntake - totalEuth) / totalIntake) * 100) : null;

    // Type donut (always from all data)
    const typeSegments = Object.entries(
        allShelters.reduce((acc, s) => {
            const t = s.shelterType || 'UNKNOWN';
            acc[t] = (acc[t] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    ).map(([type, count]) => ({
        label: type,
        value: count,
        color: TYPE_COLORS[type] || '#71717a',
    })).sort((a, b) => b.value - a.value);

    // Save rate histogram bins (from filtered data)
    const saveRateBins = [
        { label: '0–50%', count: 0, color: '#ef4444' },
        { label: '50–70%', count: 0, color: '#f97316' },
        { label: '70–90%', count: 0, color: '#fbbf24' },
        { label: '90–95%', count: 0, color: '#4ade80' },
        { label: '95–100%', count: 0, color: '#22c55e' },
    ];
    const filteredWithData = shelters.filter(s => s.totalIntakeAnnual > 0);
    for (const s of filteredWithData) {
        const sr = ((s.totalIntakeAnnual - s.totalEuthanizedAnnual) / s.totalIntakeAnnual) * 100;
        if (sr < 50) saveRateBins[0].count++;
        else if (sr < 70) saveRateBins[1].count++;
        else if (sr < 90) saveRateBins[2].count++;
        else if (sr < 95) saveRateBins[3].count++;
        else saveRateBins[4].count++;
    }

    const chipTypes: FilterKey[] = ['all', 'MUNICIPAL', 'NO_KILL', 'RESCUE', 'FOSTER_BASED'];

    return (
        <>
            {/* ── Type Filter Chips ── */}
            <div className="admin-filter-chips">
                {chipTypes.map(type => {
                    const info = TYPE_LABELS[type];
                    const count = type === 'all' ? allShelters.length : allShelters.filter(s => s.shelterType === type).length;
                    return (
                        <button
                            key={type}
                            className={`admin-filter-chip ${filter === type ? 'admin-filter-chip--active' : ''}`}
                            onClick={() => setFilter(type)}
                        >
                            {info.emoji} {info.label}
                            <span className="admin-filter-chip__count">{count.toLocaleString()}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Natural Language Explorer ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">🔍 Explore Organizations</h2>
                <AdminQueryTable
                    placeholder="Ask anything — e.g. 'municipal shelters in Florida' or 'save rate below 70%'"
                    suggestions={[
                        'All shelters by active animal count',
                        'Shelters with highest euthanasia rate',
                        'Organizations by total revenue',
                        'Foster-based rescues with no active animals',
                        'Average save rate by shelter type',
                    ]}
                    pageContext="Admin Organizations"
                />
            </div>

            <div className="admin-stats-grid">
                <div className="admin-stat">
                    <div className="admin-stat__value">{shelters.length.toLocaleString()}</div>
                    <div className="admin-stat__label">Organizations</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{shelters.filter(s => s.activeAnimals > 0).length.toLocaleString()}</div>
                    <div className="admin-stat__label">With Active Animals</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{totalActive.toLocaleString()}</div>
                    <div className="admin-stat__label">Active Animals</div>
                </div>
                {overallSaveRate !== null && (
                    <div className="admin-stat">
                        <div className="admin-stat__value">{overallSaveRate}%</div>
                        <div className="admin-stat__label">Avg Save Rate</div>
                    </div>
                )}
            </div>

            {/* ── Type Donut + Save Rate Histogram ── */}
            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">Type Distribution</h2>
                    <div style={{ paddingBottom: 'var(--space-md)' }}>
                        <DonutChart segments={typeSegments} size={180} label="Orgs" />
                    </div>
                    <div className="donut-chart-legend">
                        {typeSegments.map(s => (
                            <span key={s.label} className="donut-chart-legend__item">
                                <span className="donut-chart-legend__dot" style={{ background: s.color }} />
                                {s.label} ({s.value})
                            </span>
                        ))}
                    </div>
                </div>

                {filteredWithData.length > 0 && (
                    <div className="admin-card">
                        <h2 className="admin-card__title">Save Rate Distribution</h2>
                        <Histogram bins={saveRateBins} />
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginTop: 'var(--space-xs)', textAlign: 'center' }}>
                            Based on {filteredWithData.length} orgs with intake data
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
