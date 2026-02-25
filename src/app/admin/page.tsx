import { getAdminOverview } from '@/lib/admin-queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
    return (
        <div className={`admin-stat ${accent ? 'admin-stat--accent' : ''}`}>
            <div className="admin-stat__value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="admin-stat__label">{label}</div>
            {sub && <div className="admin-stat__sub">{sub}</div>}
        </div>
    );
}

function StatusDot({ status }: { status: string }) {
    const colorMap: Record<string, string> = {
        AVAILABLE: '#4ade80',
        URGENT: '#ef4444',
        ADOPTED: '#60a5fa',
        DELISTED: '#a1a1aa',
        EUTHANIZED: '#f87171',
        TRANSFERRED: '#c084fc',
        RETURNED_OWNER: '#fbbf24',
    };
    return <span className="admin-status-dot" style={{ background: colorMap[status] || '#71717a' }} />;
}

export default async function AdminDashboard() {
    let data;
    try {
        data = await getAdminOverview();
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

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Overview</h1>

            {/* ── Enhancement 7: Quick-Glance Summary ── */}
            <p className="admin-summary">
                Tracking <strong>{data.totalAnimals.toLocaleString()}</strong> animals across{' '}
                <strong>{data.totalShelters.toLocaleString()}</strong> shelters in{' '}
                <strong>{data.totalStates}</strong> states —{' '}
                <strong>{data.activeAnimals.toLocaleString()}</strong> currently available.
            </p>

            {/* ── Top Stats ── */}
            <div className="admin-stats-grid">
                <StatCard label="Total Animals" value={data.totalAnimals} />
                <StatCard label="Active" value={data.activeAnimals} accent />
                <StatCard label="Delisted" value={data.delistedAnimals} />
                <StatCard label="Adopted" value={data.adoptedAnimals} />
                <StatCard label="Sources" value={data.totalShelters} sub={`${data.activeShelters} active`} />
                <StatCard label="CV Coverage" value={`${cvRate}%`} sub={`${data.withCvEstimate} estimated`} />
                <StatCard label="Photo Rate" value={`${photoRate}%`} sub={`${data.withPhoto} with photos`} />
                <StatCard label="Stale (>48h)" value={data.staleAnimals} sub="Not seen recently" />
            </div>

            {/* ── Status Breakdown ── */}
            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">Status Breakdown</h2>
                    <div className="admin-breakdown">
                        {data.statusBreakdown.map(s => (
                            <div key={s.status} className="admin-breakdown__row">
                                <StatusDot status={s.status} />
                                <span className="admin-breakdown__label">{s.status}</span>
                                <span className="admin-breakdown__count">{s.count.toLocaleString()}</span>
                                <div className="admin-breakdown__bar">
                                    <div
                                        className="admin-breakdown__bar-fill"
                                        style={{ width: `${Math.min((s.count / data.totalAnimals) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="admin-card__title">Species</h2>
                    <div className="admin-breakdown">
                        {data.speciesBreakdown.map(s => (
                            <div key={s.species} className="admin-breakdown__row">
                                <span className="admin-breakdown__emoji">
                                    {s.species === 'DOG' ? '🐕' : s.species === 'CAT' ? '🐱' : '🐾'}
                                </span>
                                <span className="admin-breakdown__label">{s.species}</span>
                                <span className="admin-breakdown__count">{s.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>

                    <h2 className="admin-card__title" style={{ marginTop: '1.5rem' }}>CV Confidence</h2>
                    <div className="admin-breakdown">
                        {data.cvConfidenceBreakdown.map(c => (
                            <div key={c.confidence} className="admin-breakdown__row">
                                <span className="admin-breakdown__label">{c.confidence}</span>
                                <span className="admin-breakdown__count">{c.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="admin-card__title">Source Type</h2>
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
                                <div className="admin-breakdown__bar">
                                    <div
                                        className="admin-breakdown__bar-fill"
                                        style={{ width: `${Math.min((t.animals / data.activeAnimals) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Enhancement 1: Data Health ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">Data Health</h2>
                <div className="admin-breakdown">
                    {[
                        { label: 'No Photo', count: data.withoutPhoto, emoji: '📷' },
                        { label: 'No Size', count: data.withoutSize, emoji: '📏' },
                        { label: 'No Sex', count: data.withoutSex, emoji: '⚥' },
                        { label: 'Data Conflicts', count: data.withConflicts, emoji: '⚠️' },
                        { label: 'Visible Conditions', count: data.withVisibleConditions, emoji: '🏥' },
                    ].map(item => (
                        <div key={item.label} className="admin-breakdown__row">
                            <span className="admin-breakdown__emoji">{item.emoji}</span>
                            <span className="admin-breakdown__label">{item.label}</span>
                            <span className="admin-breakdown__count">{item.count.toLocaleString()}</span>
                            <div className="admin-breakdown__bar">
                                <div
                                    className="admin-breakdown__bar-fill admin-breakdown__bar-fill--warn"
                                    style={{ width: `${Math.min((item.count / data.totalAnimals) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Enhancement 5: State Coverage ── */}
            {data.stateBreakdown.length > 0 && (
                <div className="admin-card">
                    <h2 className="admin-card__title">Coverage by State ({data.totalStates} states)</h2>
                    <div className="admin-breakdown">
                        {data.stateBreakdown.map(s => (
                            <div key={s.state} className="admin-breakdown__row">
                                <span className="admin-breakdown__label">{s.state}</span>
                                <span className="admin-breakdown__count">
                                    {s.animals.toLocaleString()} animals · {s.shelters} shelter{s.shelters !== 1 ? 's' : ''}
                                </span>
                                <div className="admin-breakdown__bar">
                                    <div
                                        className="admin-breakdown__bar-fill"
                                        style={{ width: `${Math.min((s.animals / data.activeAnimals) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Shelter Leaderboard ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">Top Shelters by Active Animals</h2>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Shelter</th>
                            <th>State</th>
                            <th>Active</th>
                            <th>Last Scraped</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.shelterLeaderboard.filter(s => s.animalCount > 0).map(s => (
                            <tr key={s.id}>
                                <td>
                                    <Link href={`/shelter/${s.id}`} className="admin-table__link">
                                        {s.name}
                                    </Link>
                                </td>
                                <td>{s.state}</td>
                                <td className="admin-table__num">{s.animalCount}</td>
                                <td className="admin-table__date">
                                    {s.lastScrapedAt
                                        ? new Date(s.lastScrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                        : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Recent Activity ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">Recent Activity</h2>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Animal</th>
                            <th>Species</th>
                            <th>Status</th>
                            <th>Shelter</th>
                            <th>Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.recentActivity.map(a => (
                            <tr key={a.id}>
                                <td>
                                    <Link href={`/animal/${a.id}`} className="admin-table__link">
                                        {a.name || '(unnamed)'}
                                    </Link>
                                </td>
                                <td>{a.species === 'DOG' ? '🐕' : '🐱'} {a.species}</td>
                                <td><StatusDot status={a.status} /> {a.status}</td>
                                <td className="admin-table__id">{a.shelterId}</td>
                                <td className="admin-table__date">
                                    {new Date(a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
