'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { toTitleCase } from '@/lib/utils';

interface Shelter {
    id: string;
    name: string;
    state: string;
    county: string;
    websiteUrl: string | null;
    shelterType: string;
    saveRate: number;
    yearsRunning: number;
    animalCount: number;
}

/**
 * Extract a displayable location from the shelter name when county field is empty.
 * Tries common patterns: "City of X", "X County ...", "X Co. ...", "X-Y Animal ..."
 */
function extractLocationFromName(name: string): string {
    // "City of X [Animal ...]" → X
    const cityOf = name.match(/\bCity\s+of\s+(.+?)(?:\s+(?:Animal|Public|Police)|$)/i);
    if (cityOf) return cityOf[1].trim();
    // "X County ..." → X
    const county = name.match(/^(.+?)\s+County\b/i);
    if (county) return county[1].trim();
    // "X Co. ..." → X
    const co = name.match(/^(.+?)\s+Co\.\s/i);
    if (co) return co[1].trim();
    // "X-Y Animal Service" → X-Y (multi-word prefix before Animal/Humane/Sheriff)
    const prefix = name.match(/^(.+?)\s+(?:Animal|Humane|Sheriff)/i);
    if (prefix) return prefix[1].trim();
    return '';
}

const VALID_US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC', 'PR',
]);

export function BestOfBreedList({ shelters }: { shelters: Shelter[] }) {
    const [stateFilter, setStateFilter] = useState('');

    // Derive unique US states from the data (excludes Canadian provinces)
    const states = useMemo(() => {
        const set = new Set(shelters.map(s => s.state).filter(s => VALID_US_STATES.has(s)));
        return Array.from(set).sort();
    }, [shelters]);

    const filtered = useMemo(() => {
        return shelters.filter(s => {
            if (stateFilter && s.state !== stateFilter) return false;
            return true;
        });
    }, [shelters, stateFilter]);

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
                <span className="wof__filter-count">{filtered.length} of {shelters.length}</span>
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state" style={{ marginTop: '2rem' }}>
                    <p className="empty-state__text">No shelters match these filters.</p>
                </div>
            ) : (
                <ul className="wof__list">
                    {filtered.map(s => {
                        const county = toTitleCase(s.county) || toTitleCase(extractLocationFromName(s.name));
                        const location = county
                            ? `${county}, ${s.state}`
                            : s.state;
                        const displayName = toTitleCase(s.name);
                        return (
                            <li key={s.id} className="wof__item">
                                <Link href={`/shelter/${s.id}`} className="wof__link">
                                    {displayName}
                                </Link>
                                <span className="wof__detail">
                                    {location} · {s.saveRate}% save rate
                                    {s.yearsRunning >= 2 && ` · ${s.yearsRunning}+ yrs running`}
                                    {s.animalCount > 0 && ` · ${s.animalCount} 🐾`}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}
