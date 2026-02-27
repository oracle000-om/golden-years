'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    rowCount?: number;
    error?: boolean;
}

const QUICK_INSIGHTS = [
    { emoji: '🩺', label: 'Health', q: 'Give me a health overview: how many active animals have visible conditions, poor coat, high stress, or body condition scores outside 4-6?' },
    { emoji: '⚠️', label: 'High Risk', q: 'Which active animals have estimated care level high? Show their name, breed, shelter name, and visible conditions.' },
    { emoji: '📊', label: 'By State', q: 'Break down active animal count by state, ordered by count descending.' },
    { emoji: '📈', label: 'Trends', q: 'What is the average days in shelter by species and care level for active animals?' },
];

export function AdminChatWidget() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: 'Ask me anything about the shelter data — I have access to the entire database. I\'m aware of what page you\'re on.',
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [expandedSql, setExpandedSql] = useState<number | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pathname = usePathname();

    // Check admin auth on mount
    useEffect(() => {
        fetch('/api/admin-check')
            .then(res => {
                setIsAdmin(res.ok);
            })
            .catch(() => setIsAdmin(false));
    }, []);

    // Auto-scroll on new messages
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [messages, loading]);

    // Focus input when opening
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const sendMessage = useCallback(async (question: string) => {
        if (!question.trim() || loading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: question }]);
        setLoading(true);

        try {
            const res = await fetch('/api/admin-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, pageContext: pathname }),
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
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Failed to connect to the server. Please try again.',
                error: true,
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }, [loading, pathname]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    // Don't render anything for non-admins
    if (!isAdmin) return null;

    // Floating FAB when closed
    if (!isOpen) {
        return (
            <button
                className="chat-fab"
                onClick={() => setIsOpen(true)}
                aria-label="Open AI chat"
                title="Ask anything about the database"
            >
                ⚡
                <span className="chat-fab__badge" />
            </button>
        );
    }

    // Full chat drawer when open
    return (
        <div className="chat-drawer">
            <div className="chat-drawer__header">
                <div className="chat-drawer__title">
                    ⚡ Omniscient
                </div>
                <span className="chat-drawer__context" title={pathname}>
                    {pathname}
                </span>
                <button className="chat-drawer__close" onClick={() => setIsOpen(false)} aria-label="Close chat">
                    ✕
                </button>
            </div>

            <div className="admin-chat">
                <div className="admin-chat__messages" ref={messagesContainerRef}>
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`admin-chat__message admin-chat__message--${msg.role} ${msg.error ? 'admin-chat__message--error' : ''}`}
                        >
                            <div className="admin-chat__message-avatar">
                                {msg.role === 'user' ? '👤' : '⚡'}
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
                            <div className="admin-chat__message-avatar">⚡</div>
                            <div className="admin-chat__message-body">
                                <div className="admin-chat__typing">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="admin-chat__quick-insights">
                    {QUICK_INSIGHTS.map((q, i) => (
                        <button
                            key={i}
                            className="admin-chat__quick-btn"
                            onClick={() => sendMessage(q.q)}
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
                        placeholder="Ask about any data..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                    <button
                        className="admin-chat__send"
                        onClick={() => sendMessage(input)}
                        disabled={loading || !input.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
