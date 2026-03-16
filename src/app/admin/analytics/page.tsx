import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/* ── Data fetchers ── */

async function getDemandByRegion() {
    const rows = await prisma.$queryRaw<{ region: string; views: bigint }[]>`
        SELECT region, COUNT(*)::bigint as views
        FROM page_views
        WHERE region IS NOT NULL AND region != ''
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY region
        ORDER BY views DESC
        LIMIT 50
    `;
    return rows.map(r => ({ region: r.region, views: Number(r.views) }));
}

async function getSupplyByState() {
    const rows = await prisma.$queryRaw<{ state: string; count: bigint }[]>`
        SELECT s.state, COUNT(a.id)::bigint as count
        FROM shelters s
        JOIN animals a ON a.shelter_id = s.id
        WHERE a.status IN ('AVAILABLE', 'URGENT')
        GROUP BY s.state
        ORDER BY count DESC
    `;
    return rows.map(r => ({ state: r.state, count: Number(r.count) }));
}

async function getTopSearches() {
    const rows = await prisma.$queryRaw<{ query: string; count: bigint }[]>`
        SELECT search_query as query, COUNT(*)::bigint as count
        FROM page_views
        WHERE search_query IS NOT NULL AND search_query != ''
          AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY search_query
        ORDER BY count DESC
        LIMIT 100
    `;
    return rows.map(r => ({ query: r.query, count: Number(r.count) }));
}

async function getTopAnimals() {
    const rows = await prisma.$queryRaw<{
        animal_id: string;
        views: bigint;
        clicks: bigint;
    }[]>`
        SELECT
            pv.animal_id,
            COUNT(pv.id)::bigint as views,
            COALESCE(oc.clicks, 0)::bigint as clicks
        FROM page_views pv
        LEFT JOIN (
            SELECT animal_id, COUNT(*)::bigint as clicks
            FROM outbound_clicks
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY animal_id
        ) oc ON oc.animal_id = pv.animal_id
        WHERE pv.animal_id IS NOT NULL
          AND pv.created_at > NOW() - INTERVAL '30 days'
        GROUP BY pv.animal_id, oc.clicks
        ORDER BY views DESC
        LIMIT 50
    `;

    const animalIds = rows.map(r => r.animal_id);
    const animals = animalIds.length > 0
        ? await prisma.animal.findMany({
            where: { id: { in: animalIds } },
            select: { id: true, name: true, breed: true, species: true, status: true, shelterId: true },
        })
        : [];

    const animalMap = new Map(animals.map(a => [a.id, a]));

    return rows.map(r => ({
        animalId: r.animal_id,
        views: Number(r.views),
        clicks: Number(r.clicks),
        ctr: Number(r.views) > 0 ? Math.round((Number(r.clicks) / Number(r.views)) * 100) : 0,
        animal: animalMap.get(r.animal_id) || null,
    }));
}

async function getShelterPerformance() {
    const rows = await prisma.$queryRaw<{
        shelter_id: string;
        views: bigint;
        clicks: bigint;
    }[]>`
        SELECT
            pv.shelter_id,
            COUNT(pv.id)::bigint as views,
            COALESCE(oc.clicks, 0)::bigint as clicks
        FROM page_views pv
        LEFT JOIN (
            SELECT shelter_id, COUNT(*)::bigint as clicks
            FROM outbound_clicks
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY shelter_id
        ) oc ON oc.shelter_id = pv.shelter_id
        WHERE pv.shelter_id IS NOT NULL
          AND pv.created_at > NOW() - INTERVAL '30 days'
        GROUP BY pv.shelter_id, oc.clicks
        ORDER BY views DESC
        LIMIT 50
    `;

    const shelterIds = rows.map(r => r.shelter_id);
    const shelters = shelterIds.length > 0
        ? await prisma.shelter.findMany({
            where: { id: { in: shelterIds } },
            select: { id: true, name: true, state: true, county: true },
        })
        : [];

    const shelterMap = new Map(shelters.map(s => [s.id, s]));

    return rows.map(r => ({
        shelterId: r.shelter_id,
        views: Number(r.views),
        clicks: Number(r.clicks),
        ctr: Number(r.views) > 0 ? Math.round((Number(r.clicks) / Number(r.views)) * 100) : 0,
        shelter: shelterMap.get(r.shelter_id) || null,
    }));
}

async function getTotalStats() {
    const [pageViews, outboundClicks, uniqueSessions] = await Promise.all([
        prisma.pageView.count({ where: { createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
        prisma.outboundClick.count({ where: { createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
        prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(DISTINCT session_id)::bigint as count
            FROM page_views
            WHERE created_at > NOW() - INTERVAL '30 days'
        `.then(r => Number(r[0]?.count || 0)),
    ]);
    return { pageViews, outboundClicks, uniqueSessions };
}

/* ── US State abbreviation to name mapping ── */
const STATE_NAMES: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/* ── Page Component ── */

export default async function AnalyticsPage() {
    let stats = { pageViews: 0, outboundClicks: 0, uniqueSessions: 0 };
    let demandRegions: { region: string; views: number }[] = [];
    let supplyStates: { state: string; count: number }[] = [];
    let topSearches: { query: string; count: number }[] = [];
    let topAnimals: Awaited<ReturnType<typeof getTopAnimals>> = [];
    let shelterPerf: Awaited<ReturnType<typeof getShelterPerformance>> = [];
    let error = false;

    try {
        [stats, demandRegions, supplyStates, topSearches, topAnimals, shelterPerf] = await Promise.all([
            getTotalStats(),
            getDemandByRegion(),
            getSupplyByState(),
            getTopSearches(),
            getTopAnimals(),
            getShelterPerformance(),
        ]);
    } catch (e) {
        console.error('Analytics load error:', e);
        error = true;
    }

    if (error) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Analytics</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to load analytics. Tables may not exist yet — run <code>prisma migrate dev</code> to create them.</p>
                </div>
            </div>
        );
    }

    // Build demand map data: merge demand (from page_views by region) with supply (from shelters by state)
    const supplyMap = new Map(supplyStates.map(s => [s.state, s.count]));
    const allStates = new Set([...demandRegions.map(d => d.region.replace(/^US-/, '')), ...supplyStates.map(s => s.state)]);

    const mapData = [...allStates].map(state => {
        const demand = demandRegions.find(d => d.region === state || d.region === `US-${state}`)?.views || 0;
        const supply = supplyMap.get(state) || 0;
        return { state, demand, supply, name: STATE_NAMES[state] || state };
    }).sort((a, b) => b.demand - a.demand);

    const maxDemand = Math.max(...mapData.map(d => d.demand), 1);

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">📊 Analytics <span className="admin-page__subtitle">Last 30 Days</span></h1>

            {/* ── Summary Stats ── */}
            <div className="admin-stats-grid">
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.pageViews.toLocaleString()}</div>
                    <div className="admin-stat__label">Page Views</div>
                </div>
                <div className="admin-stat admin-stat--accent">
                    <div className="admin-stat__value">{stats.outboundClicks.toLocaleString()}</div>
                    <div className="admin-stat__label">Shelter Click-Throughs</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">{stats.uniqueSessions.toLocaleString()}</div>
                    <div className="admin-stat__label">Unique Visitors</div>
                </div>
                <div className="admin-stat">
                    <div className="admin-stat__value">
                        {stats.pageViews > 0 ? `${Math.round((stats.outboundClicks / stats.pageViews) * 100)}%` : '—'}
                    </div>
                    <div className="admin-stat__label">Click-Through Rate</div>
                </div>
            </div>

            <div className="admin-section-grid">
                {/* ── 1. DEMAND MAP ── */}
                <div className="admin-card analytics-card--full">
                    <h2 className="admin-card__title">🗺️ Demand vs Supply by State</h2>
                    <p className="analytics-card__subtitle">Where visitors come from vs where animals are listed</p>

                    {mapData.length === 0 ? (
                        <p className="analytics-empty">No visitor data yet. Analytics begin collecting after deployment.</p>
                    ) : (
                        <div className="analytics-map">
                            <div className="analytics-map__legend">
                                <span className="analytics-map__legend-item">
                                    <span className="analytics-map__dot analytics-map__dot--demand" /> Visitor Demand
                                </span>
                                <span className="analytics-map__legend-item">
                                    <span className="analytics-map__dot analytics-map__dot--supply" /> Active Listings
                                </span>
                                <span className="analytics-map__legend-item analytics-map__legend-item--gap">
                                    ⚠️ = Coverage Gap (high demand, low supply)
                                </span>
                            </div>
                            <div className="analytics-map__grid">
                                {mapData.map(d => {
                                    const barWidth = Math.max((d.demand / maxDemand) * 100, 2);
                                    const isGap = d.demand > 10 && d.supply < 5;
                                    return (
                                        <div key={d.state} className={`analytics-map__row ${isGap ? 'analytics-map__row--gap' : ''}`}>
                                            <span className="analytics-map__state">{d.name || d.state}</span>
                                            <div className="analytics-map__bars">
                                                <div className="analytics-map__bar analytics-map__bar--demand" style={{ width: `${barWidth}%` }}>
                                                    <span className="analytics-map__bar-label">{d.demand}</span>
                                                </div>
                                            </div>
                                            <span className="analytics-map__supply">{d.supply} listings</span>
                                            {isGap && <span className="analytics-map__gap-badge">⚠️</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="admin-section-grid">
                {/* ── 2. TOP SEARCHED ── */}
                <div className="admin-card">
                    <h2 className="admin-card__title">🔍 Top Searches</h2>
                    {topSearches.length === 0 ? (
                        <p className="analytics-empty">No searches recorded yet.</p>
                    ) : (
                        <div className="analytics-list">
                            <div className="analytics-list__header">
                                <span>Query</span>
                                <span>Count</span>
                            </div>
                            {topSearches.map((s, i) => (
                                <div key={i} className="analytics-list__row">
                                    <span className="analytics-list__query">{s.query}</span>
                                    <span className="analytics-list__count">{s.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── 3. ANIMAL ENGAGEMENT ── */}
                <div className="admin-card">
                    <h2 className="admin-card__title">🐾 Animal Engagement</h2>
                    {topAnimals.length === 0 ? (
                        <p className="analytics-empty">No animal views recorded yet.</p>
                    ) : (
                        <div className="analytics-list">
                            <div className="analytics-list__header analytics-list__header--4col">
                                <span>Animal</span>
                                <span>Views</span>
                                <span>Clicks</span>
                                <span>CTR</span>
                            </div>
                            {topAnimals.map(a => (
                                <div key={a.animalId} className="analytics-list__row analytics-list__row--4col">
                                    <span className="analytics-list__animal">
                                        {a.animal ? (
                                            <Link href={`/animal/${a.animalId}`} className="analytics-list__link">
                                                {a.animal.name || 'Unnamed'} <small>({a.animal.breed || a.animal.species})</small>
                                            </Link>
                                        ) : (
                                            <span className="analytics-list__deleted">Delisted</span>
                                        )}
                                    </span>
                                    <span className="analytics-list__count">{a.views}</span>
                                    <span className="analytics-list__count">{a.clicks}</span>
                                    <span className={`analytics-list__ctr ${a.ctr > 10 ? 'analytics-list__ctr--good' : ''}`}>
                                        {a.ctr}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── 4. SHELTER PERFORMANCE ── */}
            <div className="admin-card analytics-card--full">
                <h2 className="admin-card__title">🏛️ Shelter Performance</h2>
                <p className="analytics-card__subtitle">
                    Use this data for outreach: &ldquo;Your animals received X views this month through Golden Years Club&rdquo;
                </p>
                {shelterPerf.length === 0 ? (
                    <p className="analytics-empty">No shelter data yet.</p>
                ) : (
                    <div className="analytics-list">
                        <div className="analytics-list__header analytics-list__header--4col">
                            <span>Shelter</span>
                            <span>Views</span>
                            <span>Click-Throughs</span>
                            <span>CTR</span>
                        </div>
                        {shelterPerf.map(s => (
                            <div key={s.shelterId} className="analytics-list__row analytics-list__row--4col">
                                <span className="analytics-list__animal">
                                    {s.shelter ? (
                                        <Link href={`/shelter/${s.shelterId}`} className="analytics-list__link">
                                            {s.shelter.name} <small>({s.shelter.state})</small>
                                        </Link>
                                    ) : (
                                        <span>Unknown</span>
                                    )}
                                </span>
                                <span className="analytics-list__count">{s.views}</span>
                                <span className="analytics-list__count">{s.clicks}</span>
                                <span className={`analytics-list__ctr ${s.ctr > 10 ? 'analytics-list__ctr--good' : ''}`}>
                                    {s.ctr}%
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
