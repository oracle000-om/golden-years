'use client';

import { useState } from 'react';
import { DonutChart } from '@/components/donut-chart';
import { SplitBar } from '@/components/split-bar';
import { TrafficGauge } from '@/components/traffic-gauge';

const STATUS_COLORS: Record<string, string> = {
    AVAILABLE: '#4ade80',
    URGENT: '#ef4444',
    ADOPTED: '#60a5fa',
    DELISTED: '#a1a1aa',
    EUTHANIZED: '#f87171',
    TRANSFERRED: '#c084fc',
    RETURNED_OWNER: '#fbbf24',
};

const SIZE_COLORS: Record<string, string> = {
    SMALL: '#60a5fa',
    MEDIUM: '#4ade80',
    LARGE: '#fbbf24',
    XLARGE: '#ef4444',
};

const CARE_TAGS: Record<string, string> = {
    low: 'Routine checkups, standard diet',
    moderate: 'Meds, dental, mobility support',
    high: 'Hospice, daily meds, chronic conditions',
};

interface AnimalStats {
    total: number;
    bySpecies: { species: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byAgeSource: { source: string; count: number }[];
    byIntakeReason: { reason: string; count: number }[];
    bySex: { sex: string; count: number }[];
    bySize: { size: string; count: number }[];
    byCareLevel: { level: string; count: number }[];
    withoutName: number;
    withoutAge: number;
    urgentCount: number;
    avgDaysInShelter: number | null;
}

type FilterKey = 'all' | 'DOG' | 'CAT';

interface Props {
    all: AnimalStats;
    dogs: AnimalStats;
    cats: AnimalStats;
}

export function AnimalsContent({ all, dogs, cats }: Props) {
    const [filter, setFilter] = useState<FilterKey>('all');
    const stats = filter === 'DOG' ? dogs : filter === 'CAT' ? cats : all;

    // Status donut
    const statusSegments = stats.byStatus
        .sort((a, b) => b.count - a.count)
        .map(s => ({ label: s.status, value: s.count, color: STATUS_COLORS[s.status] || '#71717a' }));

    // Sex split bar
    const sexSegments = stats.bySex.map(s => ({
        label: s.sex || 'Unknown',
        value: s.count,
        color: s.sex === 'MALE' ? '#60a5fa' : s.sex === 'FEMALE' ? '#f472b6' : '#71717a',
        emoji: s.sex === 'MALE' ? '♂️' : s.sex === 'FEMALE' ? '♀️' : '—',
    }));

    // Size split bar
    const sizeSegments = stats.bySize.map(s => ({
        label: s.size,
        value: s.count,
        color: SIZE_COLORS[s.size] || '#71717a',
    }));

    // Care level traffic gauge
    const careLevels = ['low', 'moderate', 'high'].map(level => ({
        label: level,
        value: stats.byCareLevel.find(c => c.level === level)?.count || 0,
        color: level === 'low' ? '#4ade80' : level === 'moderate' ? '#fbbf24' : '#ef4444',
        tag: CARE_TAGS[level],
    }));

    const filters: { key: FilterKey; label: string; emoji: string }[] = [
        { key: 'all', label: 'All', emoji: '🐾' },
        { key: 'DOG', label: 'Dogs', emoji: '🐕' },
        { key: 'CAT', label: 'Cats', emoji: '🐱' },
    ];

    // Build urgent link: sort by urgency, and filter by species if a chip is selected
    const urgentParams = new URLSearchParams({ sort: 'urgency' });
    if (filter === 'DOG') urgentParams.set('species', 'DOG');
    if (filter === 'CAT') urgentParams.set('species', 'CAT');
    const urgentLink = `/listings?${urgentParams.toString()}`;

    return (
        <>
            {/* ── Filter Chips ── */}
            <div className="admin-filter-chips">
                {filters.map(f => (
                    <button
                        key={f.key}
                        className={`admin-filter-chip ${filter === f.key ? 'admin-filter-chip--active' : ''}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.emoji} {f.label}
                        <span className="admin-filter-chip__count">
                            {(f.key === 'all' ? all : f.key === 'DOG' ? dogs : cats).total.toLocaleString()}
                        </span>
                    </button>
                ))}
            </div>

            <div className="admin-stats-grid">
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.total.toLocaleString()}</div>
                    <div className="admin-stat__label">Total</div>
                </div>
                <a href={urgentLink} className="admin-stat admin-stat--accent admin-stat--link">
                    <div className="admin-stat__value">{stats.urgentCount.toLocaleString()}</div>
                    <div className="admin-stat__label">Urgent →</div>
                </a>
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.withoutAge.toLocaleString()}</div>
                    <div className="admin-stat__label">No Age Data</div>
                </div>
                {stats.avgDaysInShelter !== null && (
                    <div className="admin-stat">
                        <div className="admin-stat__value">{Math.round(stats.avgDaysInShelter)}</div>
                        <div className="admin-stat__label">Avg Days in System</div>
                    </div>
                )}
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.withoutName.toLocaleString()}</div>
                    <div className="admin-stat__label">No Name</div>
                </div>
            </div>

            {/* ── Status Donut + Care Level Gauge ── */}
            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">By Status</h2>
                    <div style={{ paddingBottom: 'var(--space-md)' }}>
                        <DonutChart segments={statusSegments} size={180} label="Animals" />
                    </div>
                    <div className="donut-chart-legend">
                        {statusSegments.map(s => (
                            <span key={s.label} className="donut-chart-legend__item">
                                <span className="donut-chart-legend__dot" style={{ background: s.color }} />
                                {s.label}
                            </span>
                        ))}
                    </div>
                </div>

                {careLevels.some(l => l.value > 0) && (
                    <div className="admin-card">
                        <h2 className="admin-card__title">Care Level</h2>
                        <TrafficGauge levels={careLevels} />
                    </div>
                )}
            </div>

            {/* ── Sex & Size Split Bars ── */}
            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">Sex Distribution</h2>
                    <SplitBar segments={sexSegments} height={36} />
                </div>

                {sizeSegments.length > 0 && (
                    <div className="admin-card">
                        <h2 className="admin-card__title">Size Distribution</h2>
                        <SplitBar segments={sizeSegments} height={36} />
                    </div>
                )}
            </div>

            {/* ── Intake & Age Source ── */}
            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">Age Source</h2>
                    <div className="admin-breakdown">
                        {stats.byAgeSource.sort((a, b) => b.count - a.count).map(s => (
                            <div key={s.source} className="admin-breakdown__row">
                                <span className="admin-breakdown__emoji">
                                    {s.source === 'CV_ESTIMATED' ? '🔬' : s.source === 'SHELTER_REPORTED' ? '🏥' : '❓'}
                                </span>
                                <span className="admin-breakdown__label">{s.source}</span>
                                <span className="admin-breakdown__count">{s.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {stats.byIntakeReason.length > 0 && (
                    <div className="admin-card">
                        <h2 className="admin-card__title">Intake Reason</h2>
                        <div className="admin-breakdown">
                            {stats.byIntakeReason.map(r => (
                                <div key={r.reason} className="admin-breakdown__row">
                                    <span className="admin-breakdown__label">{r.reason}</span>
                                    <span className="admin-breakdown__count">{r.count.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
