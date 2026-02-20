'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useRef } from 'react';

export function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            const params = new URLSearchParams(searchParams.toString());
            if (query.trim()) {
                params.set('q', query.trim());
            } else {
                params.delete('q');
            }
            router.push(`/?${params.toString()}`);
        },
        [router, searchParams, query],
    );

    const handleClear = useCallback(() => {
        setQuery('');
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        router.push(`/?${params.toString()}`);
    }, [router, searchParams]);

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
            // Auto-submit after voice input
            const params = new URLSearchParams(searchParams.toString());
            params.set('q', transcript.trim());
            router.push(`/?${params.toString()}`);
        };

        recognition.start();
        inputRef.current?.focus();
    }, [router, searchParams]);

    return (
        <form className="search-bar" onSubmit={handleSubmit}>
            <input
                ref={inputRef}
                className="search-bar__input"
                type="text"
                placeholder="Describe the senior you want to save"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
    );
}
