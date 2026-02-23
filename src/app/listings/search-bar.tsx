'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { parseSearchQuery, getIntentLabels } from '@/lib/search-parser';

interface Suggestion {
    type: 'breed' | 'location' | 'shelter';
    label: string;
    sublabel?: string;
    value: string;
    id?: string;
}

interface SuggestResponse {
    breeds: Suggestion[];
    locations: Suggestion[];
    shelters: Suggestion[];
}

export function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync query state when URL changes externally
    const urlQ = searchParams.get('q') || '';
    useEffect(() => {
        setQuery(urlQ);
    }, [urlQ]);

    // Parse intent for chips display
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
            params.delete('page'); // Reset page on new search
            router.push(`/?${params.toString()}`);
            setShowSuggestions(false);
        },
        [router, searchParams],
    );

    // Fetch typeahead suggestions
    const fetchSuggestions = useCallback(async (q: string) => {
        if (q.length < 2) {
            setSuggestions([]);
            return;
        }
        try {
            const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}&limit=6`);
            const data: SuggestResponse = await res.json();
            const all: Suggestion[] = [
                ...data.breeds.slice(0, 3),
                ...data.locations.slice(0, 2),
                ...data.shelters.slice(0, 2),
            ];
            setSuggestions(all);
            setSelectedIdx(-1);
        } catch {
            setSuggestions([]);
        }
    }, []);

    const handleChange = useCallback(
        (value: string) => {
            setQuery(value);

            // Debounce search submit
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                submitQuery(value);
            }, 400);

            // Debounce typeahead
            if (suggestRef.current) clearTimeout(suggestRef.current);
            suggestRef.current = setTimeout(() => {
                fetchSuggestions(value);
            }, 200);

            setShowSuggestions(true);
        },
        [submitQuery, fetchSuggestions],
    );

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (suggestRef.current) clearTimeout(suggestRef.current);
            submitQuery(query);
        },
        [submitQuery, query],
    );

    const handleClear = useCallback(() => {
        setQuery('');
        setSuggestions([]);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (suggestRef.current) clearTimeout(suggestRef.current);
        submitQuery('');
    }, [submitQuery]);

    const handleSuggestionClick = useCallback(
        (suggestion: Suggestion) => {
            if (suggestion.type === 'shelter' && suggestion.id) {
                router.push(`/shelter/${suggestion.id}`);
            } else {
                setQuery(suggestion.value);
                submitQuery(suggestion.value);
            }
            setShowSuggestions(false);
        },
        [router, submitQuery],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!showSuggestions || suggestions.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((prev) => Math.max(prev - 1, -1));
            } else if (e.key === 'Enter' && selectedIdx >= 0) {
                e.preventDefault();
                handleSuggestionClick(suggestions[selectedIdx]);
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        },
        [showSuggestions, suggestions, selectedIdx, handleSuggestionClick],
    );

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

    // Close suggestions on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (suggestRef.current) clearTimeout(suggestRef.current);
        };
    }, []);

    const typeIcons: Record<string, string> = {
        breed: '🏷️',
        location: '📍',
        shelter: '🏠',
    };

    return (
        <div className="search-wrapper" ref={wrapperRef}>
            <form className="search-bar" onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    className="search-bar__input"
                    type="text"
                    placeholder="Describe the senior you want to save"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    aria-label="Search animals"
                    autoComplete="off"
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

            {showSuggestions && suggestions.length > 0 && (
                <div className="search-suggest" role="listbox">
                    {suggestions.map((s, idx) => (
                        <button
                            key={`${s.type}-${s.value}`}
                            className={`search-suggest__item ${idx === selectedIdx ? 'search-suggest__item--active' : ''}`}
                            role="option"
                            aria-selected={idx === selectedIdx}
                            onMouseDown={() => handleSuggestionClick(s)}
                            onMouseEnter={() => setSelectedIdx(idx)}
                        >
                            <span className="search-suggest__icon">{typeIcons[s.type]}</span>
                            <span className="search-suggest__label">{s.label}</span>
                            {s.sublabel && (
                                <span className="search-suggest__sublabel">{s.sublabel}</span>
                            )}
                            <span className="search-suggest__type">{s.type}</span>
                        </button>
                    ))}
                </div>
            )}

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
