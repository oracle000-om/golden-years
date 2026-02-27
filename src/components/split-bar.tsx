'use client';

interface SplitBarSegment {
    label: string;
    value: number;
    color: string;
    emoji?: string;
}

export function SplitBar({ segments, height = 32 }: { segments: SplitBarSegment[]; height?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;

    return (
        <div className="split-bar">
            <div className="split-bar__track" style={{ height }}>
                {segments.filter(s => s.value > 0).map(seg => {
                    const pct = (seg.value / total) * 100;
                    return (
                        <div
                            key={seg.label}
                            className="split-bar__segment"
                            style={{ width: `${pct}%`, background: seg.color }}
                            title={`${seg.label}: ${seg.value.toLocaleString()} (${Math.round(pct)}%)`}
                        >
                            {pct > 10 && (
                                <span className="split-bar__label">
                                    {seg.emoji && `${seg.emoji} `}{Math.round(pct)}%
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="split-bar__legend">
                {segments.filter(s => s.value > 0).map(seg => (
                    <span key={seg.label} className="split-bar__legend-item">
                        <span className="split-bar__legend-dot" style={{ background: seg.color }} />
                        {seg.emoji && `${seg.emoji} `}{seg.label} ({seg.value.toLocaleString()})
                    </span>
                ))}
            </div>
        </div>
    );
}
