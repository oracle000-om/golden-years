'use client';

import { useState } from 'react';

interface HistogramBin {
    label: string;
    count: number;
    color: string;
}

export function Histogram({ bins, title }: { bins: HistogramBin[]; title?: string }) {
    const [hovered, setHovered] = useState<HistogramBin | null>(null);
    const maxCount = Math.max(...bins.map(b => b.count), 1);

    return (
        <div className="histogram">
            {title && <div className="histogram__title">{title}</div>}
            <div className="histogram__bars">
                {bins.map(bin => {
                    const heightPct = (bin.count / maxCount) * 100;
                    const isHov = hovered?.label === bin.label;
                    return (
                        <div
                            key={bin.label}
                            className={`histogram__bar-group ${isHov ? 'histogram__bar-group--hovered' : ''}`}
                            onMouseEnter={() => setHovered(bin)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            <div className="histogram__count">{bin.count}</div>
                            <div
                                className="histogram__bar"
                                style={{
                                    height: `${Math.max(heightPct, 2)}%`,
                                    background: bin.color,
                                    opacity: hovered && !isHov ? 0.4 : 1,
                                }}
                            />
                            <div className="histogram__label">{bin.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
