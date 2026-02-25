'use client';

/**
 * SparklineChart — Bar chart health assessment visualization
 *
 * Renders a compact bar chart showing a metric's readings over time.
 * Used in the "Changes Since Intake" section of animal detail pages.
 *
 * Features:
 *   - SVG vertical bars (one per reading)
 *   - Start/end value labels
 *   - Direction badge (improved/declined/stable)
 *   - Hover tooltip showing date + value
 *   - Ideal band highlight for BCS (4-5 range)
 */

import { useState } from 'react';

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
    const chartH = height - padY * 2;

    const [domMin, domMax] = domain;
    const domRange = domMax - domMin || 1;

    // Bar dimensions
    const barGap = 2;
    const totalBarWidth = width - padX * 2;
    const barWidth = Math.max(4, Math.min(16, (totalBarWidth - barGap * (sorted.length - 1)) / sorted.length));
    const totalBarsWidth = sorted.length * barWidth + (sorted.length - 1) * barGap;
    const offsetX = padX + (totalBarWidth - totalBarsWidth) / 2;

    // Map data to bar positions
    const bars = sorted.map((d, i) => {
        const barH = Math.max(2, ((d.value - domMin) / domRange) * chartH);
        return {
            x: offsetX + i * (barWidth + barGap),
            y: padY + chartH - barH,
            width: barWidth,
            height: barH,
            value: d.value,
            date: d.date,
            label: d.label,
        };
    });

    // Color based on direction
    const barColor = direction === 'improved' ? '#22c55e' : direction === 'declined' ? '#ef4444' : '#a1a1aa';
    const barColorDim = direction === 'improved' ? 'rgba(34, 197, 94, 0.4)' : direction === 'declined' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(161, 161, 170, 0.35)';

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
    const daysDiff = Math.round(
        (last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Format date
    function fmtDate(d: Date): string {
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const hovered = hoveredIndex !== null ? bars[hoveredIndex] : null;

    return (
        <div className="sparkline">
            <div className="sparkline__header">
                <span className="sparkline__label">{label}</span>
                <span className={badgeClass}>{badgeText}</span>
            </div>
            <div className="sparkline__body">
                <span className="sparkline__value sparkline__value--start">
                    {first.label || formatValue(first.value)}
                </span>
                <div className="sparkline__chart-wrapper">
                    <svg
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
                                width={totalBarWidth}
                                height={idealY2 - idealY1}
                                fill="rgba(34, 197, 94, 0.06)"
                                stroke="none"
                            />
                        )}
                        {/* Bars */}
                        {bars.map((b, i) => (
                            <rect
                                key={i}
                                x={b.x}
                                y={b.y}
                                width={b.width}
                                height={b.height}
                                rx={1.5}
                                fill={
                                    hoveredIndex === i
                                        ? barColor
                                        : i === bars.length - 1
                                            ? barColor
                                            : barColorDim
                                }
                                onMouseEnter={() => setHoveredIndex(i)}
                                style={{ cursor: 'pointer', transition: 'fill 0.15s ease' }}
                            />
                        ))}
                    </svg>
                    {/* Tooltip */}
                    {hovered && (
                        <div
                            className="sparkline__tooltip"
                            style={{
                                left: `${((hovered.x + hovered.width / 2) / width) * 100}%`,
                            }}
                        >
                            <span className="sparkline__tooltip-date">{fmtDate(hovered.date)}</span>
                            <span className="sparkline__tooltip-value">
                                {hovered.label || formatValue(hovered.value)}
                            </span>
                        </div>
                    )}
                </div>
                <span className="sparkline__value sparkline__value--end">
                    {last.label || formatValue(last.value)}
                </span>
            </div>
            <div className="sparkline__footer">
                <span className="sparkline__span">
                    {sorted.length} readings · {daysDiff > 0 ? `${daysDiff} day${daysDiff !== 1 ? 's' : ''}` : 'same day'}
                </span>
            </div>
        </div>
    );
}
