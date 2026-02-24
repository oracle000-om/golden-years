'use client';

/**
 * ShelterStatsCharts — pure SVG donut + no-kill badge for the animal detail page.
 * The intake bar graph lives on the shelter detail page instead.
 */

interface ShelterStatsChartsProps {
    intake: number;
    euthanized: number;
    dataYear: number | null;
}

export function ShelterStatsCharts({
    intake,
    euthanized,
    dataYear,
}: ShelterStatsChartsProps) {
    if (intake === 0) return null;

    const saved = intake - euthanized;
    const saveRate = Math.round(((saved) / intake) * 1000) / 10;
    const isNoKill = saveRate >= 90;

    // Donut chart geometry
    const R = 40;
    const CX = 50;
    const CY = 50;
    const STROKE = 10;
    const circumference = 2 * Math.PI * R;
    const savedArc = (saveRate / 100) * circumference;
    const euthArc = circumference - savedArc;

    return (
        <div className="shelter-charts">
            {/* --- Donut Chart --- */}
            <div className="shelter-charts__donut-section">
                {dataYear && (
                    <span className="shelter-charts__data-year">{dataYear} Data</span>
                )}
                <svg viewBox="0 0 100 100" className="shelter-charts__donut" aria-label={`${saveRate}% saved`}>
                    {/* Background ring (euthanized portion) */}
                    <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f87171" strokeWidth={STROKE} />
                    {/* Saved arc (green) */}
                    <circle
                        cx={CX} cy={CY} r={R}
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth={STROKE}
                        strokeDasharray={`${savedArc} ${euthArc}`}
                        strokeDashoffset={circumference * 0.25}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.8s ease' }}
                    />
                    {/* Center text */}
                    <text x={CX} y={CY - 4} textAnchor="middle" className="shelter-charts__donut-pct">
                        {saveRate}%
                    </text>
                    <text x={CX} y={CY + 8} textAnchor="middle" className="shelter-charts__donut-label">
                        saved
                    </text>
                </svg>
                <div className="shelter-charts__donut-legend">
                    <span className="shelter-charts__legend-item shelter-charts__legend-item--saved">
                        {saved.toLocaleString()} saved
                    </span>
                    <span className="shelter-charts__legend-item shelter-charts__legend-item--euth">
                        {euthanized.toLocaleString()} euthanized
                    </span>
                </div>
            </div>

            {/* --- No-Kill Badge (only shown if qualifies) --- */}
            {isNoKill && (
                <div className="shelter-charts__nokill">
                    <span className="gy-tooltip">
                        <span className="shelter-charts__nokill-badge yes">
                            ✓ No-Kill Shelter
                        </span>
                        <span className="gy-tooltip__popup">
                            <span className="gy-tooltip__label">No-Kill Standard</span>
                            <span className="gy-tooltip__pct">
                                A shelter is considered &ldquo;no-kill&rdquo; when its live release rate is 90% or higher. This shelter&apos;s rate is {saveRate}%.
                            </span>
                        </span>
                    </span>
                </div>
            )}
        </div>
    );
}
