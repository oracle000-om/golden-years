'use client';

import { useState } from 'react';

// Simplified US state paths for SVG map — each state is a polygon/path
// Using a well-known simplified projection
const STATE_PATHS: Record<string, string> = {
    AL: 'M628,466 L628,520 L608,534 L604,526 L596,530 L592,520 L590,466Z',
    AK: 'M161,485 L183,485 L183,530 L161,530Z',
    AZ: 'M205,410 L270,410 L280,500 L205,500Z',
    AR: 'M540,446 L590,446 L592,504 L536,504Z',
    CA: 'M115,280 L175,280 L205,410 L205,500 L140,500 L115,400Z',
    CO: 'M280,320 L380,320 L380,400 L280,400Z',
    CT: 'M810,240 L840,230 L845,255 L815,260Z',
    DE: 'M780,310 L795,305 L800,330 L785,335Z',
    FL: 'M632,530 L710,530 L730,540 L720,600 L680,620 L660,590 L640,560 L632,540Z',
    GA: 'M632,466 L690,466 L700,530 L632,530Z',
    HI: 'M260,540 L300,540 L300,570 L260,570Z',
    ID: 'M215,160 L270,160 L280,280 L230,280 L215,200Z',
    IL: 'M560,280 L600,280 L610,400 L565,400 L555,340Z',
    IN: 'M600,280 L640,280 L645,400 L610,400Z',
    IA: 'M480,260 L560,260 L560,330 L480,330Z',
    KS: 'M380,360 L490,360 L490,420 L380,420Z',
    KY: 'M600,380 L700,370 L710,400 L600,410Z',
    LA: 'M536,504 L592,504 L600,560 L570,570 L540,550Z',
    ME: 'M830,120 L860,100 L870,180 L840,190Z',
    MD: 'M730,310 L780,300 L785,335 L730,340Z',
    MA: 'M810,215 L860,210 L860,235 L810,240Z',
    MI: 'M580,170 L640,160 L650,270 L600,280 L580,230Z',
    MN: 'M450,120 L530,120 L530,230 L450,230Z',
    MS: 'M570,466 L596,466 L600,550 L570,550Z',
    MO: 'M490,360 L560,350 L570,446 L490,446Z',
    MT: 'M230,100 L380,100 L380,190 L230,190Z',
    NE: 'M350,280 L470,280 L480,340 L380,340Z',
    NV: 'M175,240 L230,240 L240,400 L195,400Z',
    NH: 'M820,140 L840,135 L840,210 L820,215Z',
    NJ: 'M790,260 L810,255 L810,320 L790,330Z',
    NM: 'M250,410 L340,410 L340,510 L250,510Z',
    NY: 'M730,170 L820,160 L820,260 L730,270Z',
    NC: 'M650,400 L780,380 L790,420 L660,440Z',
    ND: 'M370,110 L470,110 L470,190 L370,190Z',
    OH: 'M640,270 L700,260 L710,360 L645,370Z',
    OK: 'M360,420 L490,410 L500,470 L420,480 L370,460Z',
    OR: 'M115,130 L215,130 L215,230 L115,230Z',
    PA: 'M700,250 L790,240 L795,310 L700,320Z',
    RI: 'M840,230 L855,228 L855,250 L840,252Z',
    SC: 'M670,440 L740,420 L750,470 L690,470Z',
    SD: 'M370,190 L470,190 L470,280 L370,280Z',
    TN: 'M570,420 L700,400 L710,430 L570,446Z',
    TX: 'M320,460 L500,450 L510,580 L440,610 L370,590 L320,530Z',
    UT: 'M230,280 L300,280 L300,400 L240,400Z',
    VT: 'M800,135 L820,130 L820,200 L800,205Z',
    VA: 'M680,340 L780,330 L790,390 L660,400Z',
    WA: 'M130,70 L215,70 L215,160 L130,140Z',
    WV: 'M680,320 L720,310 L730,380 L690,380Z',
    WI: 'M510,140 L580,140 L580,260 L510,260Z',
    WY: 'M270,190 L370,190 L370,280 L270,280Z',
    DC: 'M755,328 L762,325 L765,335 L758,338Z',
};

// All 50 states + DC
const ALL_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

interface StateData {
    state: string;
    shelters: number;
    animals: number;
}

function getColor(animals: number, maxAnimals: number): string {
    if (animals === 0) return 'rgba(255,255,255,0.03)';
    const intensity = Math.pow(animals / maxAnimals, 0.4); // sqrt scale for better distribution
    // From dim gold to bright gold
    const r = Math.round(40 + intensity * 160);
    const g = Math.round(35 + intensity * 130);
    const b = Math.round(20 + intensity * 30);
    const a = 0.3 + intensity * 0.7;
    return `rgba(${r},${g},${b},${a})`;
}

export function UsaCoverageMap({ stateData, totalStates }: { stateData: StateData[]; totalStates: number }) {
    const [hovered, setHovered] = useState<StateData | null>(null);
    const dataMap = new Map(stateData.map(s => [s.state, s]));
    const maxAnimals = Math.max(...stateData.map(s => s.animals), 1);
    const coveredStates = stateData.filter(s => s.animals > 0).length;

    const handleStateClick = (st: string) => {
        window.location.href = `/admin/organizations?state=${st}`;
    };

    return (
        <div className="admin-card">
            <h2 className="admin-card__title">Coverage by State ({coveredStates} of {totalStates}) — click a state to view orgs</h2>

            <div className="usa-map">
                {/* Tooltip */}
                {hovered && (
                    <div className="usa-map__tooltip">
                        <strong>{hovered.state}</strong>: {hovered.animals.toLocaleString()} animals · {hovered.shelters} shelter{hovered.shelters !== 1 ? 's' : ''}
                    </div>
                )}

                <svg viewBox="80 60 820 580" className="usa-map__svg">
                    {ALL_STATES.map(st => {
                        const path = STATE_PATHS[st];
                        if (!path) return null;
                        const d = dataMap.get(st);
                        const animals = d?.animals || 0;
                        const fill = getColor(animals, maxAnimals);
                        const isHovered = hovered?.state === st;

                        return (
                            <polygon
                                key={st}
                                points={path.replace(/^M/, '').replace(/Z$/, '').replace(/L/g, ' ')}
                                fill={fill}
                                stroke={isHovered ? 'var(--color-gold)' : 'rgba(255,255,255,0.08)'}
                                strokeWidth={isHovered ? 2 : 0.5}
                                className="usa-map__state usa-map__state--clickable"
                                onMouseEnter={() => setHovered(d || { state: st, shelters: 0, animals: 0 })}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => handleStateClick(st)}
                            />
                        );
                    })}

                    {/* State labels for states with data */}
                    {ALL_STATES.map(st => {
                        const path = STATE_PATHS[st];
                        if (!path) return null;
                        const d = dataMap.get(st);
                        if (!d || d.animals === 0) return null;

                        // Calculate centroid from points
                        const pts = path.replace(/^M/, '').replace(/Z$/, '').split(/L/).map(p => {
                            const [x, y] = p.trim().split(',').map(Number);
                            return { x, y };
                        });
                        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

                        return (
                            <text
                                key={`label-${st}`}
                                x={cx}
                                y={cy}
                                className="usa-map__label"
                                textAnchor="middle"
                                dominantBaseline="central"
                                style={{ pointerEvents: 'none' }}
                            >
                                {st}
                            </text>
                        );
                    })}
                </svg>

                {/* Legend */}
                <div className="usa-map__legend">
                    <span className="usa-map__legend-label">0</span>
                    <div className="usa-map__legend-bar" />
                    <span className="usa-map__legend-label">{maxAnimals.toLocaleString()}</span>
                    <span className="usa-map__legend-suffix">animals</span>
                </div>
            </div>
        </div>
    );
}
