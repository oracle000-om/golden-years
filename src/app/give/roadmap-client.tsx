'use client';

import { useState, useEffect, useCallback } from 'react';

type Choice = 'enhance_site' | 'grants' | 'vet_costs' | 'new_programs';

interface Results {
    total: number;
    counts: Record<string, number>;
    percentages: Record<string, number>;
}

const OPTIONS: { key: Choice; icon: string; label: string }[] = [
    { key: 'enhance_site', icon: '🏠', label: 'Enhance the Golden Years Club site' },
    { key: 'grants', icon: '🎁', label: 'Give grants to organizations saving seniors' },
    { key: 'vet_costs', icon: '🩺', label: 'Help adopters with senior veterinary costs' },
    { key: 'new_programs', icon: '✨', label: 'Create actual clubs' },
];

function getOrCreateToken(): string {
    const key = 'gy_roadmap_token';
    let token = localStorage.getItem(key);
    if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(key, token);
    }
    return token;
}

export function RoadmapPoll() {
    const [voterToken, setVoterToken] = useState<string | null>(null);
    const [selected, setSelected] = useState<Choice | null>(null);
    const [results, setResults] = useState<Results | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const checkExisting = useCallback(async (token: string) => {
        try {
            const res = await fetch(`/api/roadmap-vote?voterToken=${token}`);
            const data = await res.json();
            if (data.voted) {
                setSelected(data.userChoice);
                setResults(data.results);
                setHasVoted(true);
                // Small delay so the bars animate in
                setTimeout(() => setShowResults(true), 50);
            }
        } catch {
            // silently fail
        }
    }, []);

    useEffect(() => {
        const token = getOrCreateToken();
        setVoterToken(token);
        checkExisting(token);
    }, [checkExisting]);

    async function handleVote(choice: Choice) {
        if (hasVoted || isSubmitting || !voterToken) return;
        setIsSubmitting(true);
        setSelected(choice);

        try {
            const res = await fetch('/api/roadmap-vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ choice, voterToken }),
            });
            const data = await res.json();
            if (res.ok) {
                setResults(data.results);
                setHasVoted(true);
                setTimeout(() => setShowResults(true), 50);
            }
        } catch {
            setSelected(null);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="roadmap">
            <div className="roadmap__header">
                <span className="roadmap__coming-soon">Donation portal coming soon</span>
                <h2 className="roadmap__question">
                    How would you like donations to be used?
                </h2>
            </div>

            <div className="roadmap__options">
                {OPTIONS.map((opt) => {
                    const pct = results?.percentages[opt.key] ?? 0;
                    const isSelected = selected === opt.key;

                    return (
                        <button
                            key={opt.key}
                            className={`roadmap__option ${hasVoted ? 'roadmap__option--voted' : ''} ${isSelected ? 'roadmap__option--selected' : ''}`}
                            onClick={() => handleVote(opt.key)}
                            disabled={hasVoted || isSubmitting}
                        >
                            {/* Fill bar (behind the label) */}
                            <div
                                className="roadmap__option-fill"
                                style={{ width: showResults ? `${pct}%` : '0%' }}
                            />

                            <span className="roadmap__option-content">
                                <span className="roadmap__option-icon">{opt.icon}</span>
                                <span className="roadmap__option-label">{opt.label}</span>
                            </span>

                            {showResults && (
                                <span className="roadmap__option-pct">{pct}%</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {hasVoted && results && (
                <p className="roadmap__total">
                    {results.total} vote{results.total !== 1 ? 's' : ''} cast
                </p>
            )}
        </div>
    );
}
