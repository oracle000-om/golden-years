'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminShelterDetail } from '@/lib/admin-queries';

const TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
    MUNICIPAL: { emoji: '🏛️', label: 'MUNICIPAL' },
    NO_KILL: { emoji: '🐾', label: 'NO KILL' },
    RESCUE: { emoji: '🤝', label: 'RESCUE' },
    FOSTER_BASED: { emoji: '🏠', label: 'FOSTER BASED' },
};

type FilterType = 'all' | 'MUNICIPAL' | 'NO_KILL' | 'RESCUE' | 'FOSTER_BASED';

export function OrganizationsTable({ shelters, initialSearch = '' }: { shelters: AdminShelterDetail[]; initialSearch?: string }) {
    const [search, setSearch] = useState(initialSearch);
    const [typeFilter, setTypeFilter] = useState<FilterType>('all');

    const filtered = shelters.filter(s => {
        if (typeFilter !== 'all' && s.shelterType !== typeFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return (
                s.name.toLowerCase().includes(q) ||
                s.state.toLowerCase().includes(q) ||
                s.county.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className="admin-card">
            <h2 className="admin-card__title">All Organizations ({filtered.length})</h2>

            <div className="admin-search">
                <input
                    className="admin-search__input"
                    type="text"
                    placeholder="Search by name, state, or county..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                {(['all', 'MUNICIPAL', 'NO_KILL', 'RESCUE', 'FOSTER_BASED'] as const).map(type => (
                    <button
                        key={type}
                        className={`admin-filter-btn${typeFilter === type ? ' admin-filter-btn--active' : ''}`}
                        onClick={() => setTypeFilter(type)}
                    >
                        {type === 'all' ? 'All' : TYPE_LABELS[type]?.label || type}
                    </button>
                ))}
            </div>

            <table className="admin-table admin-table--full">
                <thead>
                    <tr>
                        <th>Organization</th>
                        <th>Type</th>
                        <th>State</th>
                        <th>Total</th>
                        <th>Active</th>
                        <th>Intake/yr</th>
                        <th>Euth/yr</th>
                        <th>Save Rate</th>
                        <th>Last Scraped</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(s => {
                        const saveRate = s.totalIntakeAnnual > 0
                            ? Math.round(((s.totalIntakeAnnual - s.totalEuthanizedAnnual) / s.totalIntakeAnnual) * 100)
                            : null;

                        const now = Date.now();
                        const scrapedMs = s.lastScrapedAt ? new Date(s.lastScrapedAt).getTime() : 0;
                        const hoursAgo = s.lastScrapedAt ? (now - scrapedMs) / (1000 * 60 * 60) : Infinity;
                        const freshnessClass = !s.lastScrapedAt ? 'admin-table__dead'
                            : hoursAgo < 24 ? 'admin-table__fresh'
                                : hoursAgo < 72 ? 'admin-table__stale'
                                    : 'admin-table__dead';

                        const typeInfo = TYPE_LABELS[s.shelterType] || { emoji: '🏠', label: s.shelterType };
                        const badgeClass = `admin-badge admin-badge--${s.shelterType.toLowerCase().replace('_', '-')}`;

                        return (
                            <tr key={s.id} className={s.activeAnimals === 0 ? 'admin-table__row--dim' : ''}>
                                <td>
                                    <Link href={`/shelter/${s.id}`} className="admin-table__link">
                                        {s.name}
                                    </Link>
                                    <span className="admin-table__id">{s.id}</span>
                                </td>
                                <td>
                                    <span className={badgeClass}>
                                        {typeInfo.emoji} {typeInfo.label}
                                    </span>
                                </td>
                                <td>{s.state}</td>
                                <td className="admin-table__num">{s.totalAnimals}</td>
                                <td className="admin-table__num">{s.activeAnimals}</td>
                                <td className="admin-table__num">
                                    {s.totalIntakeAnnual > 0 ? s.totalIntakeAnnual.toLocaleString() : '—'}
                                </td>
                                <td className="admin-table__num">
                                    {s.totalEuthanizedAnnual > 0 ? s.totalEuthanizedAnnual.toLocaleString() : '—'}
                                </td>
                                <td className="admin-table__num">
                                    {saveRate !== null ? (
                                        <span className={saveRate >= 90 ? 'admin-table__good' : saveRate >= 70 ? 'admin-table__warn' : 'admin-table__bad'}>
                                            {saveRate}%
                                        </span>
                                    ) : '—'}
                                </td>
                                <td className={`admin-table__date ${freshnessClass}`}>
                                    {s.lastScrapedAt
                                        ? new Date(s.lastScrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                        : '—'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
