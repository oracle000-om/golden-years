import { getAdminOverview, getLatestScrapeRuns, getRecentScrapeRuns } from '@/lib/admin-queries';
import { UsaCoverageMap } from '@/components/usa-coverage-map';
import { DonutChart } from '@/components/donut-chart';

export const dynamic = 'force-dynamic';

const CONFIDENCE_COLORS: Record<string, string> = {
    HIGH: '#4ade80',
    MEDIUM: '#fbbf24',
    LOW: '#ef4444',
    NONE: '#52525b',
};

const STATUS_EMOJI: Record<string, string> = {
    SUCCESS: '✅',
    PARTIAL: '⚠️',
    FAILED: '❌',
    RUNNING: '🔄',
};

function timeAgo(date: Date | null): string {
    if (!date) return 'never';
    const ms = Date.now() - new Date(date).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
    if (!ms) return '—';
    const s = Math.round(Number(ms) / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function DataHealthPage() {
    let data, latestRuns, recentRuns;
    try {
        [data, latestRuns, recentRuns] = await Promise.all([
            getAdminOverview(),
            getLatestScrapeRuns(),
            getRecentScrapeRuns(30),
        ]);
    } catch (err) {
        return (
            <div className="admin-page">
                <h1 className="admin-page__title">Data Health</h1>
                <div className="admin-error">
                    <p>⚠️ Unable to connect to database.</p>
                    <p className="admin-error__detail">{(err as Error).message?.substring(0, 200)}</p>
                </div>
            </div>
        );
    }

    const t = data.totalAnimals || 1;
    const completeness = [
        { label: 'Photo', pct: Math.round(((t - data.withoutPhoto) / t) * 100), color: '#4ade80', emoji: '📷' },
        { label: 'Sex', pct: Math.round(((t - data.withoutSex) / t) * 100), color: '#60a5fa', emoji: '⚥' },
        { label: 'Size', pct: Math.round(((t - data.withoutSize) / t) * 100), color: '#fbbf24', emoji: '📏' },
        { label: 'No Conflicts', pct: Math.round(((t - data.withConflicts) / t) * 100), color: '#c084fc', emoji: '✅' },
        { label: 'Healthy', pct: Math.round(((t - data.withVisibleConditions) / t) * 100), color: '#f472b6', emoji: '💚' },
    ];

    // CV confidence donut
    const confidenceSegments = data.cvConfidenceBreakdown
        .filter(c => c.confidence)
        .map(c => ({
            label: String(c.confidence),
            value: c.count,
            color: CONFIDENCE_COLORS[String(c.confidence)] || '#52525b',
        }));

    // Sort latest runs by pipeline name
    const sortedRuns = [...latestRuns].sort((a, b) => a.pipeline.localeCompare(b.pipeline));

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Data Health</h1>

            {/* ── Scraper Pipeline Status ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">🔌 Scraper Pipeline Status</h2>
                <div className="admin-scraper-grid">
                    {sortedRuns.map(run => {
                        const meta = (run.metadata || {}) as Record<string, unknown>;
                        const delisted = typeof meta.delisted === 'number' ? meta.delisted : null;
                        return (
                            <div key={run.pipeline} className="admin-scraper-card">
                                <div className="admin-scraper-card__name">{run.pipeline}</div>
                                <span className={`admin-scraper-card__status admin-scraper-card__status--${run.status.toLowerCase()}`}>
                                    {run.status}
                                </span>
                                <div className="admin-scraper-card__meta">
                                    {timeAgo(run.startedAt)}
                                    {run.durationMs && <> · {formatDuration(run.durationMs)}</>}
                                    <br />
                                    {run.animalsCreated > 0 && <span style={{ color: '#4ade80' }}>+{run.animalsCreated} </span>}
                                    {run.animalsUpdated > 0 && <span>{run.animalsUpdated} updated </span>}
                                    {delisted != null && delisted > 0 && <span style={{ color: '#fbbf24' }}>-{delisted} delisted </span>}
                                    {run.errors > 0 && <span style={{ color: '#ef4444' }}>{run.errors} errors</span>}
                                    {run.animalsCreated === 0 && run.animalsUpdated === 0 && run.errors === 0 && (
                                        <span style={{ color: '#a1a1aa' }}>no changes</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Recent Scrape Runs ── */}
            <div className="admin-card">
                <h2 className="admin-card__title">📋 Recent Scrape Runs</h2>
                <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Pipeline</th>
                                <th>Status</th>
                                <th>When</th>
                                <th>Duration</th>
                                <th style={{ textAlign: 'right' }}>Created</th>
                                <th style={{ textAlign: 'right' }}>Updated</th>
                                <th style={{ textAlign: 'right' }}>Delisted</th>
                                <th style={{ textAlign: 'right' }}>Errors</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentRuns.map((run, i) => {
                                const meta = (run.metadata || {}) as Record<string, unknown>;
                                const delisted = typeof meta.delisted === 'number' ? meta.delisted : null;
                                const isZero = run.animalsCreated === 0 && run.animalsUpdated === 0;
                                return (
                                    <tr key={i} style={isZero && run.status !== 'RUNNING' ? { opacity: 0.6 } : undefined}>
                                        <td><strong>{run.pipeline}</strong></td>
                                        <td>
                                            <span className={`admin-scraper-card__status admin-scraper-card__status--${run.status.toLowerCase()}`}>
                                                {STATUS_EMOJI[run.status] || ''} {run.status}
                                            </span>
                                        </td>
                                        <td>{timeAgo(run.startedAt)}</td>
                                        <td>{formatDuration(run.durationMs)}</td>
                                        <td style={{ textAlign: 'right', color: run.animalsCreated > 0 ? '#4ade80' : '#71717a' }}>
                                            {run.animalsCreated > 0 ? `+${run.animalsCreated}` : '0'}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{run.animalsUpdated}</td>
                                        <td style={{ textAlign: 'right', color: delisted && delisted > 0 ? '#fbbf24' : '#71717a' }}>
                                            {delisted != null ? delisted : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', color: run.errors > 0 ? '#ef4444' : '#71717a' }}>
                                            {run.errors > 0 ? run.errors : '0'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Data Completeness Bars ── */}
            <div className="admin-section-grid">
                <div className="admin-card">
                    <h2 className="admin-card__title">Data Completeness</h2>
                    <div className="completeness-bars">
                        {completeness.map(c => (
                            <div key={c.label} className="completeness-bar">
                                <div className="completeness-bar__header">
                                    <span>{c.emoji} {c.label}</span>
                                    <span className="completeness-bar__pct">{c.pct}%</span>
                                </div>
                                <div className="completeness-bar__track">
                                    <div
                                        className="completeness-bar__fill"
                                        style={{ width: `${c.pct}%`, background: c.color }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h2 className="admin-card__title">CV Confidence</h2>
                    <div style={{ paddingBottom: 'var(--space-md)' }}>
                        <DonutChart segments={confidenceSegments} size={180} label="Assessed" />
                    </div>
                    <div className="donut-chart-legend">
                        {confidenceSegments.map(s => (
                            <span key={s.label} className="donut-chart-legend__item">
                                <span className="donut-chart-legend__dot" style={{ background: s.color }} />
                                {s.label} ({s.value.toLocaleString()})
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── State Coverage Map ── */}
            {data.stateBreakdown.length > 0 && (
                <UsaCoverageMap
                    stateData={data.stateBreakdown}
                    totalStates={data.totalStates}
                />
            )}
        </div>
    );
}

