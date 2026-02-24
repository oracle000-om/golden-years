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
            content: 'Ask me anything about the shelter data — breeds, intake patterns, species breakdown, individual shelters, or trends. I\'ll query the database for you.',
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
        } catch (err) {
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

                <div className="admin-chat__input-bar">
                    <input
                        ref={inputRef}
                        type="text"
                        className="admin-chat__input"
                        placeholder="Ask about the data..."
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
