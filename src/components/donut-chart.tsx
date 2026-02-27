'use client';

import { useState } from 'react';

interface Segment {
    label: string;
    value: number;
    color: string;
}

export function DonutChart({ segments, size = 200, label }: { segments: Segment[]; size?: number; label?: string }) {
    const [hovered, setHovered] = useState<Segment | null>(null);
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;

    const r = size / 2 - 6;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    let offset = -circumference / 4; // start at 12 o'clock

    return (
        <div className="donut-chart" style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {segments.filter(s => s.value > 0).map((seg) => {
                    const pct = seg.value / total;
                    const dashLength = pct * circumference;
                    const gap = circumference - dashLength;
                    const currentOffset = offset;
                    offset += dashLength;
                    const isHovered = hovered?.label === seg.label;

                    return (
                        <circle
                            key={seg.label}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={isHovered ? 28 : 24}
                            strokeDasharray={`${dashLength} ${gap}`}
                            strokeDashoffset={-currentOffset}
                            className="donut-chart__arc"
                            style={{ opacity: hovered && !isHovered ? 0.4 : 1 }}
                            onMouseEnter={() => setHovered(seg)}
                            onMouseLeave={() => setHovered(null)}
                        />
                    );
                })}
            </svg>
            <div className="donut-chart__center">
                {hovered ? (
                    <>
                        <div className="donut-chart__center-value">{hovered.value.toLocaleString()}</div>
                        <div className="donut-chart__center-label">{hovered.label}</div>
                    </>
                ) : (
                    <>
                        <div className="donut-chart__center-value">{total.toLocaleString()}</div>
                        <div className="donut-chart__center-label">{label || 'Total'}</div>
                    </>
                )}
            </div>
        </div>
    );
}
