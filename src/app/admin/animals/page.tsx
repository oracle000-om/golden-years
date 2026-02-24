import { getAdminAnimalStats } from '@/lib/admin-queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminAnimalsPage() {
    let stats;
    try {
        stats = await getAdminAnimalStats();
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Animals</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Animals</h1>

            <div className="admin-stats-grid">
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.total.toLocaleString()}</div>
                    <div className="admin-stat__label">Total</div>
                </div>
                <div className="admin-stat admin-stat--accent">
                    <div className="admin-stat__value">{stats.urgentCount.toLocaleString()}</div>
                    <div className="admin-stat__label">Urgent</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.withoutName.toLocaleString()}</div>
                    <div className="admin-stat__label">No Name</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.withoutAge.toLocaleString()}</div>
                    <div className="admin-stat__label">No Age</div>
                </div>
                {stats.avgDaysInShelter !== null && (
                    <div className="admin-stat">
                        <div className="admin-stat__value">{Math.round(stats.avgDaysInShelter)}</div>
                        <div className="admin-stat__label">Avg Days</div>
                    </div>
                )}
            </div>

            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">By Status</h2>
                    <div className="admin-breakdown">
                        {stats.byStatus.sort((a, b) => b.count - a.count).map(s => (
                            <div key={s.status} className="admin-breakdown__row">
                                <span className="admin-breakdown__label">{s.status}</span>
                                <span className="admin-breakdown__count">{s.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="admin-card__title">Age Source</h2>
                    <div className="admin-breakdown">
                        {stats.byAgeSource.sort((a, b) => b.count - a.count).map(s => (
                            <div key={s.source} className="admin-breakdown__row">
                                <span className="admin-breakdown__label">{s.source}</span>
                                <span className="admin-breakdown__count">{s.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>

                    <h2 className="admin-card__title" style={{ marginTop: '1.5rem' }}>By Source Type</h2>
                    <div className="admin-breakdown">
                        {stats.bySourceType.map(s => (
                            <div key={s.type} className="admin-breakdown__row">
                                <span className="admin-breakdown__emoji">
                                    {s.type === 'MUNICIPAL' ? '🏛️' : s.type === 'RESCUE' ? '🤝' : '🏠'}
                                </span>
                                <span className="admin-breakdown__label">{s.type}</span>
                                <span className="admin-breakdown__count">{s.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {stats.byPhotoQuality.length > 0 && (
                <div className="admin-card">
                    <h2 className="admin-card__title">Photo Quality Distribution</h2>
                    <div className="admin-breakdown">
                        {stats.byPhotoQuality.sort((a, b) => b.count - a.count).map(q => (
                            <div key={q.quality} className="admin-breakdown__row">
                                <span className="admin-breakdown__label">{q.quality}</span>
                                <span className="admin-breakdown__count">{q.count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recently Delisted */}
            <div className="admin-card">
                <h2 className="admin-card__title">Recently Delisted</h2>
                {stats.recentlyDelisted.length === 0 ? (
                    <p className="admin-card__empty">No recently delisted animals.</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Animal</th>
                                <th>Species</th>
                                <th>Shelter</th>
                                <th>Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recentlyDelisted.map(a => (
                                <tr key={a.id}>
                                    <td>
                                        <Link href={`/animal/${a.id}`} className="admin-table__link">
                                            {a.name || '(unnamed)'}
                                        </Link>
                                    </td>
                                    <td>{a.species}</td>
                                    <td className="admin-table__id">{a.shelterId}</td>
                                    <td className="admin-table__date">
                                        {new Date(a.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
