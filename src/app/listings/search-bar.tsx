'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { parseSearchQuery, getIntentLabels } from '@/lib/search-parser';

export function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync query state when URL changes externally (e.g. filter reset)
    const urlQ = searchParams.get('q') || '';
    useEffect(() => {
        setQuery(urlQ);
    }, [urlQ]);

    // Parse intent for chips display (client-side, no DB needed)
    const intentLabels = useMemo(() => {
        if (!urlQ.trim()) return [];
        const intent = parseSearchQuery(urlQ);
        return getIntentLabels(intent);
    }, [urlQ]);

    const submitQuery = useCallback(
        (q: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (q.trim()) {
                params.set('q', q.trim());
            } else {
                params.delete('q');
            }
            router.push(`/?${params.toString()}`);
        },
        [router, searchParams],
    );

    const handleChange = useCallback(
        (value: string) => {
            setQuery(value);

            // Debounce: auto-submit after 400ms of inactivity
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                submitQuery(value);
            }, 400);
        },
        [submitQuery],
    );

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            submitQuery(query);
        },
        [submitQuery, query],
    );

    const handleClear = useCallback(() => {
        setQuery('');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        submitQuery('');
    }, [submitQuery]);

    const handleVoice = useCallback(() => {
        const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition ||
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new (SpeechRecognition as any)();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setQuery(transcript);
            submitQuery(transcript);
        };

        recognition.start();
        inputRef.current?.focus();
    }, [submitQuery]);

    const handleNearMe = useCallback(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                // Reverse geocode to zip using a free API
                try {
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`
                    );
                    const data = await res.json();
                    const zip = data.postcode;
                    if (zip) {
                        const params = new URLSearchParams(searchParams.toString());
                        params.set('zip', zip);
                        router.push(`/?${params.toString()}`);
                    }
                } catch {
                    // Silently fail — geolocation is optional
                }
            },
            () => { /* denied — do nothing */ }
        );
    }, [router, searchParams]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    return (
        <div className="search-wrapper">
            <form className="search-bar" onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    className="search-bar__input"
                    type="text"
                    placeholder="Describe the senior you want to save"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    aria-label="Search animals"
                />
                <div className="search-bar__actions">
                    {query && (
                        <button type="button" className="search-bar__clear" onClick={handleClear} aria-label="Clear search">
                            ✕
                        </button>
                    )}
                    <button type="button" className="search-bar__voice" onClick={handleVoice} aria-label="Voice search">
                        🎙
                    </button>
                </div>
            </form>

            {intentLabels.length > 0 && (
                <div className="search-chips" aria-label="Active search filters">
                    {intentLabels.map((chip, idx) => (
                        <span key={`${chip.field}-${idx}`} className="search-chip">
                            <span className="search-chip__emoji">{chip.emoji}</span>
                            {chip.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
