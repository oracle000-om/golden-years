'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useRef, useTransition } from 'react';

interface FilterBarProps {
    currentSpecies: string;
    currentState: string;
    currentSex: string;
    currentZip: string;
    currentSort: string;
    currentRadius: string;
    hasLocation: boolean;
    states: string[];
}

export function FilterBar({
    currentSpecies, currentState, currentSex, currentZip,
    currentSort, currentRadius, hasLocation, states,
}: FilterBarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [zipValue, setZipValue] = useState(currentZip);
    const [locating, setLocating] = useState(false);
    const [isPending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateFilter = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (value === 'all' || value === '' || (key === 'sort' && value === 'urgency') || (key === 'radius' && value === '100')) {
                params.delete(key);
            } else {
                params.set(key, value);
            }
            // Reset page on filter change
            params.delete('page');
            startTransition(() => {
                router.push(`/?${params.toString()}`);
            });
        },
        [router, searchParams],
    );

    const handleZipChange = useCallback(
        (value: string) => {
            const cleaned = value.replace(/\D/g, '').slice(0, 5);
            setZipValue(cleaned);

            if (debounceRef.current) clearTimeout(debounceRef.current);

            if (cleaned.length === 5 || cleaned.length === 0) {
                debounceRef.current = setTimeout(() => {
                    updateFilter('zip', cleaned);
                }, 300);
            }
        },
        [updateFilter],
    );

    const handleLocate = useCallback(async () => {
        if (!navigator.geolocation) return;

        setLocating(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' } },
                    );
                    const data = await res.json();
                    const zip = data?.address?.postcode?.replace(/\D/g, '')?.slice(0, 5);

                    if (zip && zip.length === 5) {
                        setZipValue(zip);
                        updateFilter('zip', zip);
                    }
                } catch {
                    // Silently fail
                } finally {
                    setLocating(false);
                }
            },
            () => {
                setLocating(false);
            },
            { enableHighAccuracy: false, timeout: 8000 },
        );
    }, [updateFilter]);

    const resetFilters = useCallback(() => {
        setZipValue('');
        startTransition(() => {
            router.push('/');
        });
    }, [router, startTransition]);

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
            </select>

            <select
                className="filter-bar__select"
                value={currentSex}
                onChange={(e) => updateFilter('sex', e.target.value)}
                aria-label="Filter by gender"
            >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
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

            <select
                className="filter-bar__select"
                value={currentSort}
                onChange={(e) => updateFilter('sort', e.target.value)}
                aria-label="Sort results"
            >
                <option value="urgency">Sort: Urgency</option>
                <option value="newest">Sort: Newest</option>
                <option value="distance">Sort: Distance</option>
                <option value="age">Sort: Oldest</option>
            </select>

            <div className="filter-bar__location-group">
                <input
                    className="filter-bar__input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Zip code"
                    value={zipValue}
                    onChange={(e) => handleZipChange(e.target.value)}
                    aria-label="Filter by zip code"
                    maxLength={5}
                />
                <button
                    className="filter-bar__locate"
                    onClick={handleLocate}
                    disabled={locating}
                    aria-label="Use my location"
                    title="Use my location"
                >
                    {locating ? '…' : '📍'}
                </button>
            </div>

            {hasLocation && (
                <select
                    className="filter-bar__select filter-bar__select--sm"
                    value={currentRadius}
                    onChange={(e) => updateFilter('radius', e.target.value)}
                    aria-label="Search radius"
                >
                    <option value="25">25 mi</option>
                    <option value="50">50 mi</option>
                    <option value="100">100 mi</option>
                    <option value="250">250 mi</option>
                    <option value="any">Any distance</option>
                </select>
            )}

            <button className="filter-bar__reset" onClick={resetFilters} disabled={isPending}>
                {isPending ? 'Resetting…' : 'Reset'}
            </button>
        </div>
    );
}
