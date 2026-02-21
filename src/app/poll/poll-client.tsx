'use client';

import { useState, useEffect, useCallback } from 'react';

interface Poll {
    id: string;
    slug: string;
    title: string;
    statement: string;
    forTitle: string;
    forArgument: string;
    againstTitle: string;
    againstArgument: string;
    neitherTitle: string;
    neitherPrompt: string;
}

interface PollResults {
    total: number;
    forCount: number;
    againstCount: number;
    neitherCount: number;
    forPercent: number;
    againstPercent: number;
    neitherPercent: number;
    neitherResponses: string[];
}

type VoteChoice = 'FOR' | 'AGAINST' | 'NEITHER';
type ViewMode = 'card' | 'list';

function getOrCreateToken(): string {
    const key = 'gy_poll_token';
    let token = localStorage.getItem(key);
    if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(key, token);
    }
    return token;
}

/* ─── Page-level wrapper ─── */
export function PollPageClient({ polls }: { polls: Poll[] }) {
    const [viewMode, setViewMode] = useState<ViewMode>('card');

    return (
        <div className="poll-container">
            <div className="poll-header">
                <div className="poll-header__center">
                    <span className="page-badge">🗳️ Public Square</span>
                    <h1 className="poll-header__title">What Does the Club Think?</h1>
                    <p className="poll-header__subtitle">
                        Read the facts. Pick a side. See where the club lands.
                    </p>
                </div>
                <div className="poll-header__controls">
                    <div className="poll-view-toggle">
                        <button
                            className={`poll-view-toggle__btn ${viewMode === 'card' ? 'poll-view-toggle__btn--active' : ''}`}
                            onClick={() => setViewMode('card')}
                            title="Compact view"
                        >
                            <span className="poll-view-toggle__icon">⊞</span> Compact
                        </button>
                        <button
                            className={`poll-view-toggle__btn ${viewMode === 'list' ? 'poll-view-toggle__btn--active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="Expanded view"
                        >
                            <span className="poll-view-toggle__icon">≡</span> Expand
                        </button>
                    </div>
                </div>
            </div>

            <div className={`poll-feed ${viewMode === 'list' ? 'poll-feed--list' : ''}`}>
                {polls.map((poll) => (
                    <PollCard key={poll.id} poll={poll} viewMode={viewMode} />
                ))}
            </div>

            <div className="poll-request-more">
                <p className="poll-request-more__text">Have a topic the club should weigh in on?</p>
                <a
                    href="mailto:hello@goldenyears.club?subject=Public%20Square%20Topic%20Request"
                    className="poll-request-more__btn"
                >
                    Request a Topic →
                </a>
            </div>
        </div>
    );
}

/* ─── Single poll card ─── */
function PollCard({ poll, viewMode }: { poll: Poll; viewMode: ViewMode }) {
    const [voterToken, setVoterToken] = useState<string | null>(null);
    const [selected, setSelected] = useState<VoteChoice | null>(null);
    const [neitherText, setNeitherText] = useState('');
    const [results, setResults] = useState<PollResults | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState(false);

    const checkExistingVote = useCallback(async (token: string) => {
        try {
            const res = await fetch(
                `/api/poll/results?pollId=${poll.id}&voterToken=${token}`
            );
            const data = await res.json();
            if (!data.locked) {
                setResults(data.results);
                setSelected(data.userChoice);
                setHasVoted(true);
            }
        } catch {
            // Silently fail
        }
    }, [poll.id]);

    useEffect(() => {
        const token = getOrCreateToken();
        setVoterToken(token);
        checkExistingVote(token);
    }, [checkExistingVote]);

    async function handleVote(choice: VoteChoice) {
        if (hasVoted || isSubmitting || !voterToken) return;

        if (choice === 'NEITHER' && !neitherText.trim()) {
            setError('Share your thoughts before submitting.');
            return;
        }

        setError('');
        setIsSubmitting(true);

        try {
            const res = await fetch('/api/poll/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pollId: poll.id,
                    choice,
                    neitherText: choice === 'NEITHER' ? neitherText : undefined,
                    voterToken,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Something went wrong.');
                return;
            }

            setSelected(choice);
            setResults(data.results);
            setHasVoted(true);
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleUndo() {
        if (!voterToken || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/poll/vote', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pollId: poll.id, voterToken }),
            });
            if (res.ok) {
                setSelected(null);
                setResults(null);
                setHasVoted(false);
                setNeitherText('');
                setExpanded(false);
            }
        } catch {
            // silently fail
        } finally {
            setIsSubmitting(false);
        }
    }

    const isListMode = viewMode === 'list';

    return (
        <div className={`poll-item ${isListMode ? 'poll-item--list' : ''} ${hasVoted ? 'poll-item--voted' : ''}`}>
            {/* Statement + vote status */}
            <div className="poll-item__header" onClick={() => !isListMode && setExpanded(!expanded)}>
                <div className="poll-item__statement">
                    <p className="poll-item__statement-title">{poll.title}</p>
                    <p className="poll-item__statement-text">{poll.statement}</p>
                </div>
                <div className="poll-item__status">
                    {hasVoted && results && (
                        <span className="poll-item__vote-count">{results.total} vote{results.total !== 1 ? 's' : ''}</span>
                    )}
                    {!isListMode && (
                        <span className={`poll-item__chevron ${expanded ? 'poll-item__chevron--open' : ''}`}>▾</span>
                    )}
                </div>
            </div>

            {/* Inline results bar (always visible if voted) */}
            {hasVoted && results && (
                <div className="poll-item__inline-results">
                    <div className="poll-item__proportion">
                        <div className="poll-item__proportion-track">
                            {results.forPercent > 0 && (
                                <div
                                    className="poll-item__proportion-seg poll-item__proportion-seg--for"
                                    style={{ flex: results.forPercent }}
                                />
                            )}
                            {results.againstPercent > 0 && (
                                <div
                                    className="poll-item__proportion-seg poll-item__proportion-seg--against"
                                    style={{ flex: results.againstPercent }}
                                />
                            )}
                            {results.neitherPercent > 0 && (
                                <div
                                    className="poll-item__proportion-seg poll-item__proportion-seg--neither"
                                    style={{ flex: results.neitherPercent }}
                                />
                            )}
                        </div>
                        <div className="poll-item__proportion-legend">
                            <span className="poll-item__proportion-label poll-item__proportion-label--for">👍 {results.forPercent}%</span>
                            <span className="poll-item__proportion-label poll-item__proportion-label--against">👎 {results.againstPercent}%</span>
                            <span className="poll-item__proportion-label poll-item__proportion-label--neither">🤔 {results.neitherPercent}%</span>
                        </div>
                    </div>
                    {selected && (
                        <span className="poll-item__your-vote">
                            ✓ You voted {selected === 'FOR' ? 'For' : selected === 'AGAINST' ? 'Against' : 'Neither'}
                            <button
                                className="poll-item__undo"
                                onClick={handleUndo}
                                disabled={isSubmitting}
                            >
                                Undo
                            </button>
                        </span>
                    )}
                </div>
            )}

            {/* Expanded voting section — card view only, or always in list */}
            {(isListMode || expanded) && !hasVoted && (
                <div className="poll-item__body">
                    {/* Arguments */}
                    <div className="poll-item__arguments">
                        <button
                            className="poll-item__arg poll-item__arg--for"
                            onClick={() => handleVote('FOR')}
                            disabled={isSubmitting}
                        >
                            <span className="poll-item__arg-icon">👍</span>
                            <div className="poll-item__arg-content">
                                <strong className="poll-item__arg-title">{poll.forTitle}</strong>
                                <p className="poll-item__arg-text">{poll.forArgument}</p>
                            </div>
                        </button>

                        <button
                            className="poll-item__arg poll-item__arg--against"
                            onClick={() => handleVote('AGAINST')}
                            disabled={isSubmitting}
                        >
                            <span className="poll-item__arg-icon">👎</span>
                            <div className="poll-item__arg-content">
                                <strong className="poll-item__arg-title">{poll.againstTitle}</strong>
                                <p className="poll-item__arg-text">{poll.againstArgument}</p>
                            </div>
                        </button>
                    </div>

                    {/* Neither */}
                    <div className="poll-item__neither">
                        <div className="poll-item__neither-header">
                            <span className="poll-item__arg-icon">🤔</span>
                            <strong>{poll.neitherTitle}</strong>
                        </div>
                        <p className="poll-item__neither-prompt">{poll.neitherPrompt}</p>
                        <textarea
                            className="poll-item__textarea"
                            placeholder="What do you think needs to change?"
                            value={neitherText}
                            onChange={(e) => {
                                setNeitherText(e.target.value);
                                if (error) setError('');
                            }}
                            maxLength={500}
                            rows={2}
                        />
                        <div className="poll-item__textarea-footer">
                            <span className="poll-item__char-count">{neitherText.length}/500</span>
                            <button
                                className="poll-item__submit"
                                onClick={() => handleVote('NEITHER')}
                                disabled={isSubmitting || !neitherText.trim()}
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </div>

                    {error && <p className="poll-item__error">{error}</p>}
                </div>
            )}

            {/* Expanded results — card view, voted + expanded */}
            {(isListMode || expanded) && hasVoted && results && results.neitherResponses.length > 0 && (
                <div className="poll-item__body">
                    <div className="poll-item__responses">
                        <p className="poll-item__responses-title">What people think needs to change</p>
                        <ul className="poll-item__responses-list">
                            {results.neitherResponses.map((text, i) => (
                                <li key={i} className="poll-item__response-item">{text}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* Card mode: click to expand prompt */}
            {!isListMode && !expanded && !hasVoted && (
                <button className="poll-item__expand" onClick={() => setExpanded(true)}>
                    Weigh in →
                </button>
            )}
        </div>
    );
}
