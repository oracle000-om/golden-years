import { getAdminShelterList } from '@/lib/admin-queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminRescuePage() {
    let allShelters;
    try {
        allShelters = await getAdminShelterList();
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Rescue Organizations</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    // Filter to rescue-type organizations
    const rescues = allShelters.filter(s =>
        s.shelterType === 'RESCUE' || s.shelterType === 'FOSTER_BASED'
    );
    const totalActive = rescues.reduce((sum, s) => sum + s.activeAnimals, 0);
    const withData = rescues.filter(s => s.totalIntakeAnnual > 0);

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Rescue Organizations</h1>

            <div className="admin-stats-grid">
                <div className="admin-stat">
                    <div className="admin-stat__value">{rescues.length}</div>
                    <div className="admin-stat__label">Total Rescues</div>
                </div>
                <div className="admin-stat admin-stat--accent">
                    <div className="admin-stat__value">{rescues.filter(s => s.activeAnimals > 0).length}</div>
                    <div className="admin-stat__label">With Active Animals</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{totalActive.toLocaleString()}</div>
                    <div className="admin-stat__label">Total Active</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{rescues.filter(s => s.shelterType === 'RESCUE').length}</div>
                    <div className="admin-stat__label">Rescue</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{rescues.filter(s => s.shelterType === 'FOSTER_BASED').length}</div>
                    <div className="admin-stat__label">Foster-Based</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{withData.length}</div>
                    <div className="admin-stat__label">With Outcome Data</div>
                </div>
            </div>

            <div className="admin-card">
                <h2 className="admin-card__title">All Rescue Organizations</h2>
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
                        {rescues.map(s => {
                            const saveRate = s.totalIntakeAnnual > 0
                                ? Math.round(((s.totalIntakeAnnual - s.totalEuthanizedAnnual) / s.totalIntakeAnnual) * 100)
                                : null;

                            // Freshness indicator
                            const now = Date.now();
                            const scrapedMs = s.lastScrapedAt ? new Date(s.lastScrapedAt).getTime() : 0;
                            const hoursAgo = s.lastScrapedAt ? (now - scrapedMs) / (1000 * 60 * 60) : Infinity;
                            const freshnessClass = !s.lastScrapedAt ? 'admin-table__dead'
                                : hoursAgo < 24 ? 'admin-table__fresh'
                                    : hoursAgo < 72 ? 'admin-table__stale'
                                        : 'admin-table__dead';

                            return (
                                <tr key={s.id} className={s.activeAnimals === 0 ? 'admin-table__row--dim' : ''}>
                                    <td>
                                        <Link href={`/shelter/${s.id}`} className="admin-table__link">
                                            {s.name}
                                        </Link>
                                        <span className="admin-table__id">{s.id}</span>
                                    </td>
                                    <td>
                                        <span className={`admin-badge admin-badge--${s.shelterType.toLowerCase().replace('_', '-')}`}>
                                            {s.shelterType === 'FOSTER_BASED' ? '🏠' : '🤝'} {s.shelterType.replace('_', ' ')}
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
        </div>
    );
}
