'use client';

import { useState, useMemo } from 'react';

interface Shelter {
    id: string;
    name: string;
    state: string;
    county: string;
    websiteUrl: string | null;
    shelterType: string;
    saveRate: number;
    yearsRunning: number;
}

export function BestOfBreedList({ shelters }: { shelters: Shelter[] }) {
    const [stateFilter, setStateFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');

    // Derive unique states from the data
    const states = useMemo(() => {
        const set = new Set(shelters.map(s => s.state));
        return Array.from(set).sort();
    }, [shelters]);

    const filtered = useMemo(() => {
        return shelters.filter(s => {
            if (stateFilter && s.state !== stateFilter) return false;
            if (sourceFilter === 'shelter' && (s.shelterType === 'RESCUE' || s.shelterType === 'FOSTER_BASED')) return false;
            if (sourceFilter === 'rescue' && s.shelterType !== 'RESCUE' && s.shelterType !== 'FOSTER_BASED') return false;
            return true;
        });
    }, [shelters, stateFilter, sourceFilter]);

    return (
        <>
            <div className="wof__filters">
                <select
                    className="wof__filter-select"
                    value={stateFilter}
                    onChange={e => setStateFilter(e.target.value)}
                >
                    <option value="">All States</option>
                    {states.map(st => (
                        <option key={st} value={st}>{st}</option>
                    ))}
                </select>
                <select
                    className="wof__filter-select"
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                >
                    <option value="">All Sources</option>
                    <option value="shelter">Shelters</option>
                    <option value="rescue">Rescues</option>
                </select>
                <span className="wof__filter-count">{filtered.length} of {shelters.length}</span>
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state" style={{ marginTop: '2rem' }}>
                    <p className="empty-state__text">No shelters match these filters.</p>
                </div>
            ) : (
                <ul className="wof__list">
                    {filtered.map(s => {
                        const href = s.websiteUrl || `https://www.perplexity.ai/search?q=${encodeURIComponent(s.name + ' ' + s.county + ' ' + s.state)}`;
                        return (
                            <li key={s.id} className="wof__item">
                                <a href={href} target="_blank" rel="noopener noreferrer" className="wof__link">
                                    {s.name}
                                </a>
                                <span className="wof__detail">
                                    {s.county}, {s.state} · {s.saveRate}% save rate
                                    {s.yearsRunning >= 2 && ` · ${s.yearsRunning}+ yrs running`}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}
