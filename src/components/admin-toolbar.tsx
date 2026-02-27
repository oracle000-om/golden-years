'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

// ── Types ──

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    rowCount?: number;
    error?: boolean;
}

type ActivePanel = null | 'chat' | 'notepad';

const STORAGE_KEY = 'gy_admin_notes';

const QUICK_INSIGHTS = [
    { emoji: '🩺', label: 'Health', q: 'Give me a health overview: how many active animals have visible conditions, poor coat, high stress, or body condition scores outside 4-6?' },
    { emoji: '⚠️', label: 'High Risk', q: 'Which active animals have estimated care level high? Show their name, breed, shelter name, and visible conditions.' },
    { emoji: '📊', label: 'By State', q: 'Break down active animal count by state, ordered by count descending.' },
    { emoji: '📈', label: 'Trends', q: 'What is the average days in shelter by species and care level for active animals?' },
];

export function AdminToolbar() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);

    // ── Chat state ──
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'assistant', content: 'Ask me anything about the shelter data — I have access to the entire database. I\'m aware of what page you\'re on.' },
    ]);
    const [chatInput, setChatInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [expandedSql, setExpandedSql] = useState<number | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);

    // ── Notepad state ──
    const [notes, setNotes] = useState('');
    const [saved, setSaved] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const pathname = usePathname();

    // Auth check
    useEffect(() => {
        fetch('/api/admin-check')
            .then(res => {
                if (res.ok) {
                    setIsAdmin(true);
                    const savedNotes = localStorage.getItem(STORAGE_KEY);
                    if (savedNotes) setNotes(savedNotes);
                }
            })
            .catch(() => setIsAdmin(false));
    }, []);

    // Auto-scroll chat
    useEffect(() => {
        const container = chatContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
    }, [messages, loading]);

    // Focus on panel open
    useEffect(() => {
        if (activePanel === 'chat') setTimeout(() => chatInputRef.current?.focus(), 100);
        if (activePanel === 'notepad') setTimeout(() => textareaRef.current?.focus(), 100);
    }, [activePanel]);

    // ── Chat logic ──
    const sendMessage = useCallback(async (question: string) => {
        if (!question.trim() || loading) return;
        setChatInput('');
        setMessages(prev => [...prev, { role: 'user', content: question }]);
        setLoading(true);
        try {
            const res = await fetch('/api/admin-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, pageContext: pathname }),
            });
            const data = await res.json();
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.error || data.answer,
                sql: data.sql,
                rowCount: data.rowCount,
                error: !!data.error,
            }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect.', error: true }]);
        } finally {
            setLoading(false);
            chatInputRef.current?.focus();
        }
    }, [loading, pathname]);

    // ── Notepad logic ──
    const handleNotesChange = useCallback((value: string) => {
        setNotes(value);
        setSaved(false);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, value);
            setSaved(true);
        }, 500);
    }, []);

    useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

    if (!isAdmin) return null;

    const lineCount = notes.split('\n').length;
    const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

    return (
        <>
            {/* ── Panels ── */}
            {activePanel === 'chat' && (
                <div className="admin-dock__panel admin-dock__panel--chat">
                    <div className="admin-dock__panel-header">
                        <span className="admin-dock__panel-title">⚡ Omniscient</span>
                        <span className="chat-drawer__context" title={pathname}>{pathname}</span>
                        <button className="admin-dock__panel-close" onClick={() => setActivePanel(null)}>✕</button>
                    </div>
                    <div className="admin-chat">
                        <div className="admin-chat__messages" ref={chatContainerRef}>
                            {messages.map((msg, i) => (
                                <div key={i} className={`admin-chat__message admin-chat__message--${msg.role} ${msg.error ? 'admin-chat__message--error' : ''}`}>
                                    <div className="admin-chat__message-avatar">{msg.role === 'user' ? '👤' : '⚡'}</div>
                                    <div className="admin-chat__message-body">
                                        <p className="admin-chat__message-text">{msg.content}</p>
                                        {msg.sql && (
                                            <div className="admin-chat__sql-section">
                                                <button className="admin-chat__sql-toggle" onClick={() => setExpandedSql(expandedSql === i ? null : i)}>
                                                    {expandedSql === i ? '▾' : '▸'} SQL
                                                    {msg.rowCount !== undefined && <span className="admin-chat__row-count">{msg.rowCount} row{msg.rowCount !== 1 ? 's' : ''}</span>}
                                                </button>
                                                {expandedSql === i && <pre className="admin-chat__sql-code">{msg.sql}</pre>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="admin-chat__message admin-chat__message--assistant">
                                    <div className="admin-chat__message-avatar">⚡</div>
                                    <div className="admin-chat__message-body">
                                        <div className="admin-chat__typing"><span /><span /><span /></div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="admin-chat__quick-insights">
                            {QUICK_INSIGHTS.map((q, i) => (
                                <button key={i} className="admin-chat__quick-btn" onClick={() => sendMessage(q.q)} disabled={loading} title={q.q}>
                                    {q.emoji} {q.label}
                                </button>
                            ))}
                        </div>
                        <div className="admin-chat__input-bar">
                            <input
                                ref={chatInputRef}
                                type="text"
                                className="admin-chat__input"
                                placeholder="Ask about any data..."
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
                                disabled={loading}
                            />
                            <button className="admin-chat__send" onClick={() => sendMessage(chatInput)} disabled={loading || !chatInput.trim()}>Send</button>
                        </div>
                    </div>
                </div>
            )}

            {activePanel === 'notepad' && (
                <div className="admin-dock__panel admin-dock__panel--notepad">
                    <div className="admin-dock__panel-header">
                        <span className="admin-dock__panel-title">📝 Notes</span>
                        <span className="notepad-drawer__status">{saved ? '✓ saved' : 'saving...'}</span>
                        <button className="admin-dock__panel-close" onClick={() => setActivePanel(null)}>✕</button>
                    </div>
                    <textarea
                        ref={textareaRef}
                        className="notepad-drawer__textarea"
                        value={notes}
                        onChange={e => handleNotesChange(e.target.value)}
                        placeholder="Jot down bugs, ideas, or notes while browsing..."
                        spellCheck={false}
                    />
                    <div className="notepad-drawer__footer">
                        <span>{lineCount} line{lineCount !== 1 ? 's' : ''} · {wordCount} word{wordCount !== 1 ? 's' : ''}</span>
                        <button className="notepad-drawer__clear" onClick={() => { if (confirm('Clear all notes?')) handleNotesChange(''); }}>Clear</button>
                    </div>
                </div>
            )}

            {/* ── Dock Bar ── */}
            <div className="admin-dock">
                <button
                    className={`admin-dock__btn${activePanel === 'notepad' ? ' admin-dock__btn--active' : ''}`}
                    onClick={() => setActivePanel(activePanel === 'notepad' ? null : 'notepad')}
                    title="Notes"
                >
                    📝
                </button>
                <button
                    className={`admin-dock__btn admin-dock__btn--chat${activePanel === 'chat' ? ' admin-dock__btn--active' : ''}`}
                    onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
                    title="Ask the database anything"
                >
                    ⚡
                </button>
            </div>
        </>
    );
}
