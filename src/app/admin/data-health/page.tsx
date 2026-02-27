import { getAdminOverview } from '@/lib/admin-queries';
import { UsaCoverageMap } from '@/components/usa-coverage-map';
import { DonutChart } from '@/components/donut-chart';

export const dynamic = 'force-dynamic';

const CONFIDENCE_COLORS: Record<string, string> = {
    HIGH: '#4ade80',
    MEDIUM: '#fbbf24',
    LOW: '#ef4444',
    NONE: '#52525b',
};

export default async function DataHealthPage() {
    let data;
    try {
        data = await getAdminOverview();
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

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Data Health</h1>

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
