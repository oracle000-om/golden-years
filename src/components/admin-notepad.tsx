'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'gy_admin_notes';

export function AdminNotepad() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [notes, setNotes] = useState('');
    const [saved, setSaved] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Check admin auth on mount
    useEffect(() => {
        fetch('/api/admin-check')
            .then(res => {
                if (res.ok) {
                    setIsAdmin(true);
                    // Load saved notes from localStorage
                    const saved = localStorage.getItem(STORAGE_KEY);
                    if (saved) setNotes(saved);
                }
            })
            .catch(() => setIsAdmin(false));
    }, []);

    // Focus textarea when opening
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Auto-save with debounce
    const handleChange = useCallback((value: string) => {
        setNotes(value);
        setSaved(false);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, value);
            setSaved(true);
        }, 500);
    }, []);

    // Save on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    if (!isAdmin) return null;

    if (!isOpen) {
        return (
            <button
                className="notepad-fab"
                onClick={() => setIsOpen(true)}
                aria-label="Open notepad"
                title="Admin notes"
            >
                📝
            </button>
        );
    }

    const lineCount = notes.split('\n').length;
    const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;

    return (
        <div className="notepad-drawer">
            <div className="notepad-drawer__header">
                <div className="notepad-drawer__title">
                    📝 Notes
                </div>
                <div className="notepad-drawer__status">
                    {saved ? '✓ saved' : 'saving...'}
                </div>
                <button className="notepad-drawer__close" onClick={() => setIsOpen(false)} aria-label="Close notepad">
                    ✕
                </button>
            </div>
            <textarea
                ref={textareaRef}
                className="notepad-drawer__textarea"
                value={notes}
                onChange={e => handleChange(e.target.value)}
                placeholder="Jot down bugs, ideas, or notes while browsing..."
                spellCheck={false}
            />
            <div className="notepad-drawer__footer">
                <span>{lineCount} line{lineCount !== 1 ? 's' : ''} · {wordCount} word{wordCount !== 1 ? 's' : ''}</span>
                <button
                    className="notepad-drawer__clear"
                    onClick={() => {
                        if (confirm('Clear all notes?')) {
                            handleChange('');
                        }
                    }}
                >
                    Clear
                </button>
            </div>
        </div>
    );
}
