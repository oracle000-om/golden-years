'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    rowCount?: number;
    error?: boolean;
}

export default function AdminChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: 'Ask me anything about the shelter data — health metrics, breed risks, care levels, intake patterns, or trends. Try a Quick Insight below or type your own question.',
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [expandedSql, setExpandedSql] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [messages, loading]);

    async function handleSend() {
        const question = input.trim();
        if (!question || loading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: question }]);
        setLoading(true);

        try {
            const res = await fetch('/api/admin-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question }),
            });

            const data = await res.json();

            if (data.error) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.error,
                    sql: data.sql,
                    error: true,
                }]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer,
                    sql: data.sql,
                    rowCount: data.rowCount,
                }]);
            }
        } catch (_err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Failed to connect to the server. Please try again.',
                error: true,
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    const QUICK_INSIGHTS = [
        { emoji: '🩺', label: 'Health Overview', q: 'Give me a health overview: how many active animals have visible conditions, poor coat, high stress, or body condition scores outside 4-6?' },
        { emoji: '⚠️', label: 'High Risk Animals', q: 'Which active animals have estimated care level high? Show their name, breed, shelter name, and visible conditions.' },
        { emoji: '🧬', label: 'Breed Health Risks', q: 'Which breed profiles have health risk score 7 or above? Show breed name, species, health risk score, and common conditions.' },
        { emoji: '📊', label: 'Care by State', q: 'Break down the count of active animals by estimated care level and state, ordered by high care count descending.' },
        { emoji: '🏥', label: 'BCS Distribution', q: 'What is the distribution of body condition scores across all active animals? Show each score and its count.' },
        { emoji: '📈', label: 'Avg Days in Shelter', q: 'What is the average days in shelter by species and care level for active animals?' },
    ];

    function handleQuickInsight(question: string) {
        setInput(question);
        // Auto-send after a tick so the user sees the question
        setTimeout(() => {
            setInput('');
            setMessages(prev => [...prev, { role: 'user', content: question }]);
            setLoading(true);
            fetch('/api/admin-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question }),
            })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        setMessages(prev => [...prev, { role: 'assistant', content: data.error, sql: data.sql, error: true }]);
                    } else {
                        setMessages(prev => [...prev, { role: 'assistant', content: data.answer, sql: data.sql, rowCount: data.rowCount }]);
                    }
                })
                .catch(() => {
                    setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to the server.', error: true }]);
                })
                .finally(() => {
                    setLoading(false);
                    inputRef.current?.focus();
                });
        }, 50);
    }

    return (
        <div className="admin-page">
            <h1 className="admin-page__title">Data Chat</h1>

            <div className="admin-chat">
                <div className="admin-chat__messages" ref={messagesContainerRef}>
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`admin-chat__message admin-chat__message--${msg.role} ${msg.error ? 'admin-chat__message--error' : ''}`}
                        >
                            <div className="admin-chat__message-avatar">
                                {msg.role === 'user' ? '👤' : '🤖'}
                            </div>
                            <div className="admin-chat__message-body">
                                <p className="admin-chat__message-text">{msg.content}</p>
                                {msg.sql && (
                                    <div className="admin-chat__sql-section">
                                        <button
                                            className="admin-chat__sql-toggle"
                                            onClick={() => setExpandedSql(expandedSql === i ? null : i)}
                                        >
                                            {expandedSql === i ? '▾' : '▸'} SQL
                                            {msg.rowCount !== undefined && (
                                                <span className="admin-chat__row-count">
                                                    {msg.rowCount} row{msg.rowCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </button>
                                        {expandedSql === i && (
                                            <pre className="admin-chat__sql-code">{msg.sql}</pre>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="admin-chat__message admin-chat__message--assistant">
                            <div className="admin-chat__message-avatar">🤖</div>
                            <div className="admin-chat__message-body">
                                <div className="admin-chat__typing">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                <div className="admin-chat__quick-insights">
                    {QUICK_INSIGHTS.map((q, i) => (
                        <button
                            key={i}
                            className="admin-chat__quick-btn"
                            onClick={() => handleQuickInsight(q.q)}
                            disabled={loading}
                            title={q.q}
                        >
                            {q.emoji} {q.label}
                        </button>
                    ))}
                </div>

                <div className="admin-chat__input-bar">
                    <input
                        ref={inputRef}
                        type="text"
                        className="admin-chat__input"
                        placeholder="Ask about health data, breed risks, care levels..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        autoFocus
                    />
                    <button
                        className="admin-chat__send"
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
