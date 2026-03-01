import { getAdminOverview, get24hDeltas } from '@/lib/admin-queries';
import { prisma } from '@/lib/db';
import { DonutChart } from '@/components/donut-chart';
import { SplitBar } from '@/components/split-bar';
import { AdminQueryTable } from '@/components/admin-query-table';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function StatCard({ label, value, sub, accent, delta }: { label: string; value: string | number; sub?: string; accent?: boolean; delta?: number }) {
    return (
        <div className={`admin-stat ${accent ? 'admin-stat--accent' : ''}`}>
            <div className="admin-stat__value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="admin-stat__label">{label}</div>
            {delta !== undefined && delta !== 0 && (
                <span className={`admin-stat__delta ${delta > 0 ? 'admin-stat__delta--up' : 'admin-stat__delta--down'}`}>
                    {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toLocaleString()} / 24h
                </span>
            )}
            {sub && <div className="admin-stat__sub">{sub}</div>}
        </div>
    );
}

const STATUS_COLORS: Record<string, string> = {
    AVAILABLE: '#4ade80',
    URGENT: '#ef4444',
    ADOPTED: '#60a5fa',
    DELISTED: '#a1a1aa',
    EUTHANIZED: '#f87171',
    TRANSFERRED: '#c084fc',
    RETURNED_OWNER: '#fbbf24',
};

export default async function AdminDashboard() {
    let data, deltas;
    let pendingReEntries = 0;
    try {
        [data, deltas, pendingReEntries] = await Promise.all([
            getAdminOverview(),
            get24hDeltas(),
            prisma.reEntryCandidate.count({ where: { status: 'PENDING_REVIEW' } }).catch(() => 0),
        ]);
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Dashboard</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    const cvRate = data.totalAnimals > 0
        ? Math.round((data.withCvEstimate / data.totalAnimals) * 100)
        : 0;
    const photoRate = data.totalAnimals > 0
        ? Math.round((data.withPhoto / data.totalAnimals) * 100)
        : 0;

    // Prepare donut data
    const statusSegments = data.statusBreakdown.map(s => ({
        label: s.status,
        value: s.count,
        color: STATUS_COLORS[s.status] || '#71717a',
    }));

    // Prepare species split bar
    const speciesSegments = data.speciesBreakdown.map(s => ({
        label: s.species,
        value: s.count,
        color: s.species === 'DOG' ? '#c8a55a' : s.species === 'CAT' ? '#60a5fa' : '#a1a1aa',
        emoji: s.species === 'DOG' ? '🐕' : s.species === 'CAT' ? '🐱' : '🐾',
    }));

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Overview</h1>

            {/* ── Re-Entry Alert ── */}
            {pendingReEntries > 0 && (
                <Link href="/admin/re-entries" className="admin-reentry-alert">
                    <span className="admin-reentry-alert__icon">🔄</span>
                    <span className="admin-reentry-alert__text">
                        <span className="admin-reentry-alert__count">{pendingReEntries}</span>{' '}
                        pending re-entry review{pendingReEntries !== 1 ? 's' : ''} — animals may have re-entered the system
                    </span>
                </Link>
            )}

            {/* ── Natural Language Explorer ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">🔍 Explore Data</h2>
                <AdminQueryTable
                    placeholder="Ask anything — e.g. 'shelters in California' or 'top sources by active animals'"
                    suggestions={[
                        'Top 10 shelters by active animals',
                        'Shelters with 0 active animals',
                        'No-kill shelters by save rate',
                        'Shelters not scraped in 48+ hours',
                        'Average intake by shelter type',
                    ]}
                    pageContext="Admin Overview"
                />
            </div>

            {/* ── System Report Card ── */}
            <div className="admin-report-card">
                <h2 className="admin-report-card__heading">📊 System Report Card</h2>

                {/* Quick-Glance Summary */}
                <p className="admin-summary">
                    Tracking <strong>{data.totalAnimals.toLocaleString()}</strong> animals across{' '}
                    <strong>{data.totalShelters.toLocaleString()}</strong> shelters in{' '}
                    <strong>{data.totalStates}</strong> states —{' '}
                    <strong>{data.activeAnimals.toLocaleString()}</strong> currently available.
                </p>



                {/* Stats Grid */}
                <div className="admin-stats-grid">
                    <StatCard label="Total Animals" value={data.totalAnimals} delta={deltas.newAnimals} />
                    <StatCard label="Active" value={data.activeAnimals} accent />
                    <StatCard label="Delisted" value={data.delistedAnimals} delta={deltas.delisted} />
                    <StatCard label="Adopted" value={data.adoptedAnimals} delta={deltas.adopted} />
                    <StatCard label="Sources" value={data.totalShelters} sub={`${data.activeShelters} active`} />
                    <StatCard label="CV Coverage" value={`${cvRate}%`} sub={`${data.withCvEstimate} estimated`} />
                    <StatCard label="Photo Rate" value={`${photoRate}%`} sub={`${data.withPhoto} with photos`} />
                    <StatCard label="Stale (>48h)" value={data.staleAnimals} sub="Not seen recently" />
                </div>

                {/* Status Donut + Species Bar */}
                <div className="admin-section-grid">
                    <div className="admin-card">
                        <h2 className="admin-card__title">Status Distribution</h2>
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

                    <div className="admin-card">
                        <h2 className="admin-card__title">Species</h2>
                        <SplitBar segments={speciesSegments} height={36} />

                        <h2 className="admin-card__title" style={{ marginTop: '1.5rem' }}>Source Type</h2>
                        <div className="admin-breakdown">
                            {data.shelterTypeBreakdown.map(t => (
                                <div key={t.type} className="admin-breakdown__row">
                                    <span className="admin-breakdown__emoji">
                                        {t.type === 'MUNICIPAL' ? '🏛️' : t.type === 'RESCUE' ? '🤝' : t.type === 'NO_KILL' ? '🐾' : '🏠'}
                                    </span>
                                    <span className="admin-breakdown__label">{t.type}</span>
                                    <span className="admin-breakdown__count">
                                        {t.animals.toLocaleString()} animals · {t.shelters} orgs
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>


            </div>
        </div>
    );
}
