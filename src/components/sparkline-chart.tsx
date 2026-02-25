'use client';

/**
 * SparklineChart — Inline SVG trend visualization
 *
 * Renders a compact SVG sparkline showing a metric's trajectory over time.
 * Used in the "Changes Since Intake" section of animal detail pages.
 *
 * Features:
 *   - SVG polyline with gradient fill
 *   - Start/end value labels
 *   - Direction badge (improved/declined/stable)
 *   - Hover tooltip showing date + value
 *   - Ideal band highlight for BCS (4-5 range)
 */

import { useState, useRef } from 'react';

export interface SparklinePoint {
    date: Date;
    value: number;
    label?: string;
}

interface SparklineChartProps {
    data: SparklinePoint[];
    label: string;
    domain: [number, number];
    /** Which direction is "good"? green-high = higher is better, green-low = lower is better */
    colorDirection: 'green-high' | 'green-low';
    /** Optional ideal band to highlight (e.g., BCS 4-5) */
    idealBand?: [number, number];
    /** Format the value for display */
    formatValue?: (value: number) => string;
}

function defaultFormat(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function SparklineChart({
    data,
    label,
    domain,
    colorDirection,
    idealBand,
    formatValue = defaultFormat,
}: SparklineChartProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    if (data.length < 2) return null;

    const sorted = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // Determine direction
    const diff = last.value - first.value;
    const direction: 'improved' | 'declined' | 'stable' =
        Math.abs(diff) < 0.01 ? 'stable'
            : (colorDirection === 'green-high' ? diff > 0 : diff < 0) ? 'improved'
                : 'declined';

    // Chart dimensions
    const width = 140;
    const height = 36;
    const padX = 2;
    const padY = 4;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    const [domMin, domMax] = domain;
    const domRange = domMax - domMin || 1;

    // Map data to SVG coordinates
    const timeMin = first.date.getTime();
    const timeMax = last.date.getTime();
    const timeRange = timeMax - timeMin || 1;

    const points = sorted.map((d) => ({
        x: padX + ((d.date.getTime() - timeMin) / timeRange) * chartW,
        y: padY + chartH - ((d.value - domMin) / domRange) * chartH,
        value: d.value,
        date: d.date,
        label: d.label,
    }));

    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPath = `M${points[0].x},${height - padY} L${polyline} L${points[points.length - 1].x},${height - padY} Z`;

    // Color based on direction
    const lineColor = direction === 'improved' ? '#22c55e' : direction === 'declined' ? '#ef4444' : '#a1a1aa';
    const fillColor = direction === 'improved' ? 'rgba(34, 197, 94, 0.12)' : direction === 'declined' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(161, 161, 170, 0.08)';

    // Ideal band coords
    let idealY1 = 0, idealY2 = 0;
    if (idealBand) {
        idealY1 = padY + chartH - ((idealBand[1] - domMin) / domRange) * chartH;
        idealY2 = padY + chartH - ((idealBand[0] - domMin) / domRange) * chartH;
    }

    // Badge
    const badgeText = direction === 'improved' ? '↑ Improving' : direction === 'declined' ? '↓ Declining' : '— Stable';
    const badgeClass = `sparkline__badge sparkline__badge--${direction}`;

    // Days span
    const daysDiff = Math.round((timeMax - timeMin) / (1000 * 60 * 60 * 24));

    // Format date
    function fmtDate(d: Date): string {
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;

    return (
        <div className="sparkline">
            <div className="sparkline__header">
                <span className="sparkline__label">{label}</span>
                <span className={badgeClass}>{badgeText}</span>
            </div>
            <div className="sparkline__body">
                <span className="sparkline__value sparkline__value--start">{formatValue(first.value)}</span>
                <div className="sparkline__chart-wrapper">
                    <svg
                        ref={svgRef}
                        className="sparkline__svg"
                        viewBox={`0 0 ${width} ${height}`}
                        preserveAspectRatio="none"
                        onMouseLeave={() => setHoveredIndex(null)}
                    >
                        {/* Ideal band */}
                        {idealBand && (
                            <rect
                                x={padX}
                                y={idealY1}
                                width={chartW}
                                height={idealY2 - idealY1}
                                fill="rgba(34, 197, 94, 0.06)"
                                stroke="none"
                            />
                        )}
                        {/* Area fill */}
                        <path d={areaPath} fill={fillColor} />
                        {/* Line */}
                        <polyline
                            points={polyline}
                            fill="none"
                            stroke={lineColor}
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                        />
                        {/* Data point dots */}
                        {points.map((p, i) => (
                            <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r={hoveredIndex === i ? 3 : (i === points.length - 1 ? 2.5 : 1.5)}
                                fill={i === points.length - 1 ? lineColor : '#fff'}
                                stroke={lineColor}
                                strokeWidth="1"
                                onMouseEnter={() => setHoveredIndex(i)}
                                style={{ cursor: 'pointer' }}
                            />
                        ))}
                    </svg>
                    {/* Tooltip */}
                    {hovered && (
                        <div
                            className="sparkline__tooltip"
                            style={{
                                left: `${(hovered.x / width) * 100}%`,
                            }}
                        >
                            <span className="sparkline__tooltip-date">{fmtDate(hovered.date)}</span>
                            <span className="sparkline__tooltip-value">{hovered.label || formatValue(hovered.value)}</span>
                        </div>
                    )}
                </div>
                <span className="sparkline__value sparkline__value--end">{formatValue(last.value)}</span>
            </div>
            <div className="sparkline__footer">
                <span className="sparkline__span">
                    {sorted.length} readings · {daysDiff > 0 ? `${daysDiff} day${daysDiff !== 1 ? 's' : ''}` : 'same day'}
                </span>
            </div>
        </div>
    );
}
