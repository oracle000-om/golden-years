'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useRef, useTransition } from 'react';

interface FilterBarProps {
    currentSpecies: string;
    currentState: string;
    currentSex: string;
    currentZip: string;
    states: string[];
}

export function FilterBar({ currentSpecies, currentState, currentSex, currentZip, states }: FilterBarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [zipValue, setZipValue] = useState(currentZip);
    const [locating, setLocating] = useState(false);
    const [isPending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updateFilter = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (value === 'all' || value === '') {
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
            // Only allow digits, max 5
            const cleaned = value.replace(/\D/g, '').slice(0, 5);
            setZipValue(cleaned);

            if (debounceRef.current) clearTimeout(debounceRef.current);

            // Apply filter when 5 digits entered, or clear when empty
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
                    // Silently fail — user can still type manually
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

            <button className="filter-bar__reset" onClick={resetFilters} disabled={isPending}>
                {isPending ? 'Resetting…' : 'Reset'}
            </button>
        </div>
    );
}
