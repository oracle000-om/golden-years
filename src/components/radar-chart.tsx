'use client';

import { useState } from 'react';

interface RadarAxis {
    label: string;
    value: number;   // 0-100 completeness percentage
    emoji?: string;
}

export function RadarChart({ axes, size = 240 }: { axes: RadarAxis[]; size?: number }) {
    const [hovered, setHovered] = useState<RadarAxis | null>(null);
    const n = axes.length;
    if (n < 3) return null;

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 30;
    const angleStep = (Math.PI * 2) / n;
    const startAngle = -Math.PI / 2; // start at top

    function point(i: number, pct: number) {
        const angle = startAngle + i * angleStep;
        return {
            x: cx + Math.cos(angle) * maxR * pct,
            y: cy + Math.sin(angle) * maxR * pct,
        };
    }

    // Grid rings at 25%, 50%, 75%, 100%
    const rings = [0.25, 0.5, 0.75, 1.0];

    // Data polygon points
    const dataPoints = axes.map((a, i) => point(i, a.value / 100));
    const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';

    return (
        <div className="radar-chart" style={{ position: 'relative' }}>
            {hovered && (
                <div className="radar-chart__tooltip">
                    {hovered.emoji} {hovered.label}: <strong>{hovered.value}%</strong> complete
                </div>
            )}
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Grid rings */}
                {rings.map(r => {
                    const ringPath = axes.map((_, i) => {
                        const p = point(i, r);
                        return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
                    }).join(' ') + 'Z';
                    return (
                        <path key={r} d={ringPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                    );
                })}

                {/* Axis lines */}
                {axes.map((_, i) => {
                    const p = point(i, 1);
                    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
                })}

                {/* Data fill */}
                <path d={dataPath} fill="rgba(200, 165, 90, 0.15)" stroke="rgba(200, 165, 90, 0.8)" strokeWidth={2} />

                {/* Data points */}
                {axes.map((a, i) => {
                    const p = dataPoints[i];
                    const isHov = hovered?.label === a.label;
                    return (
                        <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={isHov ? 5 : 3.5}
                            fill={isHov ? 'var(--color-gold)' : 'rgba(200, 165, 90, 0.9)'}
                            stroke="rgba(0,0,0,0.4)"
                            strokeWidth={1}
                            className="radar-chart__point"
                            onMouseEnter={() => setHovered(a)}
                            onMouseLeave={() => setHovered(null)}
                        />
                    );
                })}

                {/* Labels */}
                {axes.map((a, i) => {
                    const p = point(i, 1.18);
                    return (
                        <text
                            key={`label-${i}`}
                            x={p.x}
                            y={p.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="radar-chart__label"
                            onMouseEnter={() => setHovered(a)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            {a.emoji || a.label}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
}
