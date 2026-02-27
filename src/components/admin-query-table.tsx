'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';

interface QueryResult {
    answer: string;
    rows: Record<string, any>[];
    rowCount: number;
    sql?: string;
    error?: string;
}

interface Props {
    placeholder?: string;
    suggestions?: string[];
    pageContext?: string;
}

export function AdminQueryTable({ placeholder, suggestions, pageContext }: Props) {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [tableOpen, setTableOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const runQuery = useCallback(async (q: string) => {
        if (!q.trim()) return;
        setLoading(true);
        setResult(null);
        setTableOpen(false);
        try {
            const res = await fetch('/api/admin-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: q, pageContext }),
            });
            const data = await res.json();
            if (data.error) {
                setResult({ answer: '', rows: [], rowCount: 0, error: data.error });
            } else {
                setResult(data);
            }
        } catch {
            setResult({ answer: '', rows: [], rowCount: 0, error: 'Failed to fetch results' });
        } finally {
            setLoading(false);
        }
    }, [pageContext]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        runQuery(query);
    };

    const handleSuggestion = (s: string) => {
        setQuery(s);
        runQuery(s);
    };

    // Build table columns from first row
    const columns = result?.rows?.[0] ? Object.keys(result.rows[0]) : [];

    // Format cell values
    const formatCell = (key: string, val: any) => {
        if (val === null || val === undefined) return '—';
        if (typeof val === 'number') {
            if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('pct') || key.toLowerCase().includes('percent')) {
                return `${Math.round(val)}%`;
            }
            return val.toLocaleString();
        }
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
            return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        return String(val);
    };

    const formatHeader = (key: string) => {
        return key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .replace(/Id\b/, 'ID');
    };

    const isLinkable = (key: string, val: any) => {
        if (typeof val !== 'string') return false;
        if (key === 'id' || key === 'shelter_id') return true;
        return false;
    };

    return (
        <div className="admin-query-widget">
            {/* ── Search Bar ── */}
            <form className="admin-query-bar" onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    className="admin-query-bar__input"
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={placeholder || 'Ask anything about the data...'}
                    disabled={loading}
                />
                <button className="admin-query-bar__btn" type="submit" disabled={loading}>
                    {loading ? '⏳' : '⚡'}
                </button>
            </form>

            {/* ── Suggestion Tags ── */}
            {suggestions && suggestions.length > 0 && !result && !loading && (
                <div className="admin-query-suggestions">
                    {suggestions.map(s => (
                        <button
                            key={s}
                            className="admin-query-suggestion"
                            onClick={() => handleSuggestion(s)}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Loading ── */}
            {loading && (
                <div className="admin-query-loading">
                    <div className="admin-query-loading__spinner" />
                    <span>Querying database...</span>
                </div>
            )}

            {/* ── Error ── */}
            {result?.error && (
                <div className="admin-query-error">
                    ⚠️ {result.error}
                </div>
            )}

            {/* ── Results ── */}
            {result && !result.error && (
                <div className="admin-query-result">
                    {/* Natural language answer */}
                    {result.answer && (
                        <div className="admin-query-answer">
                            <span className="admin-query-answer__icon">💡</span>
                            <span>{result.answer}</span>
                        </div>
                    )}

                    {/* Collapsible table */}
                    {columns.length > 0 && (
                        <div className="admin-query-detail">
                            <button
                                className="admin-query-detail__toggle"
                                onClick={() => setTableOpen(!tableOpen)}
                            >
                                <span className={`admin-query-detail__arrow ${tableOpen ? 'admin-query-detail__arrow--open' : ''}`}>▶</span>
                                View data ({result.rowCount} row{result.rowCount !== 1 ? 's' : ''})
                            </button>

                            {tableOpen && (
                                <div className="admin-query-table__scroll">
                                    <table className="admin-table admin-table--full">
                                        <thead>
                                            <tr>
                                                {columns.map(col => (
                                                    <th key={col}>{formatHeader(col)}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.rows.map((row, i) => (
                                                <tr key={i}>
                                                    {columns.map(col => (
                                                        <td key={col} className={typeof row[col] === 'number' ? 'admin-table__num' : ''}>
                                                            {isLinkable(col, row[col]) ? (
                                                                <Link href={`/shelter/${row[col]}`} className="admin-table__link">
                                                                    {String(row[col]).substring(0, 8)}…
                                                                </Link>
                                                            ) : col === 'name' && row['id'] ? (
                                                                <Link href={`/shelter/${row['id']}`} className="admin-table__link">
                                                                    {formatCell(col, row[col])}
                                                                </Link>
                                                            ) : (
                                                                formatCell(col, row[col])
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {result.rowCount > result.rows.length && (
                                        <div className="admin-query-meta" style={{ marginTop: 'var(--space-xs)' }}>
                                            Showing {result.rows.length} of {result.rowCount}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
