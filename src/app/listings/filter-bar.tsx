'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface FilterBarProps {
    currentSpecies: string;
    currentTime: string;
    currentState: string;
    states: string[];
}

export function FilterBar({ currentSpecies, currentTime, currentState, states }: FilterBarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const updateFilter = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (value === 'all') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
            router.push(`/listings?${params.toString()}`);
        },
        [router, searchParams],
    );

    const resetFilters = useCallback(() => {
        router.push('/listings');
    }, [router]);

    return (
        <div className="filter-bar">
            <select
                className="filter-bar__select"
                value={currentSpecies}
                onChange={(e) => updateFilter('species', e.target.value)}
                aria-label="Filter by species"
            >
                <option value="all">All Species</option>
                <option value="dog">Dogs</option>
                <option value="cat">Cats</option>
                <option value="other">Other</option>
            </select>

            <select
                className="filter-bar__select"
                value={currentTime}
                onChange={(e) => updateFilter('time', e.target.value)}
                aria-label="Filter by time to death"
            >
                <option value="all">All Timeframes</option>
                <option value="24">Next 24 hours</option>
                <option value="48">Next 48 hours</option>
                <option value="72">Next 72 hours</option>
                <option value="168">Next 7 days</option>
            </select>

            <select
                className="filter-bar__select"
                value={currentState}
                onChange={(e) => updateFilter('state', e.target.value)}
                aria-label="Filter by state"
            >
                <option value="all">All States</option>
                {states.map((state) => (
                    <option key={state} value={state}>{state}</option>
                ))}
            </select>

            <button className="filter-bar__reset" onClick={resetFilters}>
                Reset Filters
            </button>
        </div>
    );
}
