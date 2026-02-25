import { getAdminShelterList } from '@/lib/admin-queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminSheltersPage() {
    let allShelters;
    try {
        allShelters = await getAdminShelterList();
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Shelters</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    // Only MUNICIPAL + NO_KILL — rescues have their own tab
    const shelters = allShelters.filter(s =>
        s.shelterType === 'MUNICIPAL' || s.shelterType === 'NO_KILL'
    );
    const totalActive = shelters.reduce((sum, s) => sum + s.activeAnimals, 0);
    const withData = shelters.filter(s => s.totalIntakeAnnual > 0);

    // Compute aggregate save rate
    const totalIntake = withData.reduce((sum, s) => sum + s.totalIntakeAnnual, 0);
    const totalEuth = withData.reduce((sum, s) => sum + s.totalEuthanizedAnnual, 0);
    const overallSaveRate = totalIntake > 0 ? Math.round(((totalIntake - totalEuth) / totalIntake) * 100) : null;

    // No-kill achievers (≥ 90% save rate)
    const noKillCount = withData.filter(s => {
        const sr = ((s.totalIntakeAnnual - s.totalEuthanizedAnnual) / s.totalIntakeAnnual) * 100;
        return sr >= 90;
    }).length;

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Shelters</h1>

            <div className="admin-stats-grid">
                <div className="admin-stat">
                    <div className="admin-stat__value">{shelters.length}</div>
                    <div className="admin-stat__label">Total Shelters</div>
                </div>
                <div className="admin-stat admin-stat--accent">
                    <div className="admin-stat__value">{shelters.filter(s => s.activeAnimals > 0).length}</div>
                    <div className="admin-stat__label">With Active Animals</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{totalActive.toLocaleString()}</div>
                    <div className="admin-stat__label">Total Active</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{shelters.filter(s => s.shelterType === 'MUNICIPAL').length}</div>
                    <div className="admin-stat__label">Municipal</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{shelters.filter(s => s.shelterType === 'NO_KILL').length}</div>
                    <div className="admin-stat__label">No-Kill</div>
                </div>
                {overallSaveRate !== null && (
                    <div className="admin-stat">
                        <div className="admin-stat__value">{overallSaveRate}%</div>
                        <div className="admin-stat__label">Avg Save Rate</div>
                    </div>
                )}
                {withData.length > 0 && (
                    <div className="admin-stat">
                        <div className="admin-stat__value">{noKillCount}/{withData.length}</div>
                        <div className="admin-stat__label">No-Kill Achievers</div>
                    </div>
                )}
            </div>

            <div className="admin-card">
                <h2 className="admin-card__title">All Shelters ({shelters.length})</h2>
                <table className="admin-table admin-table--full">
                    <thead>
                        <tr>
                            <th>Shelter</th>
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
                        {shelters.map(s => {
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
                                            {s.shelterType === 'MUNICIPAL' ? '🏛️' : '🐾'} {s.shelterType.replace('_', ' ')}
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
