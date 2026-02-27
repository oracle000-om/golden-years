'use client';

interface TrafficLevel {
    label: string;
    value: number;
    color: string;
    tag?: string;
}

export function TrafficGauge({ levels }: { levels: TrafficLevel[] }) {
    const total = levels.reduce((s, l) => s + l.value, 0);
    if (total === 0) return null;

    return (
        <div className="traffic-gauge">
            {levels.map(level => {
                const pct = Math.round((level.value / total) * 100);
                return (
                    <div key={level.label} className="traffic-gauge__item">
                        <div
                            className="traffic-gauge__circle"
                            style={{
                                background: level.color,
                                boxShadow: `0 0 ${Math.max(8, pct / 3)}px ${level.color}40`,
                                transform: `scale(${0.7 + (pct / 100) * 0.5})`,
                            }}
                        >
                            <span className="traffic-gauge__value">{level.value.toLocaleString()}</span>
                        </div>
                        <div className="traffic-gauge__label">{level.label}</div>
                        <div className="traffic-gauge__pct">{pct}%</div>
                        {level.tag && (
                            <div className="traffic-gauge__tag">{level.tag}</div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
