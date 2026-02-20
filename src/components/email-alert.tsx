'use client';

import { useState, useCallback } from 'react';

export function EmailAlert() {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || loading) return;

        setLoading(true);

        // Store email in localStorage for now (backend integration later)
        const existing = JSON.parse(localStorage.getItem('gyc-alerts') || '[]');
        if (!existing.includes(email)) {
            existing.push(email);
            localStorage.setItem('gyc-alerts', JSON.stringify(existing));
        }

        // Simulate a brief delay
        await new Promise(r => setTimeout(r, 500));

        setSubmitted(true);
        setLoading(false);
    }, [email, loading]);

    if (submitted) {
        return (
            <div className="email-alert">
                <div className="email-alert__icon">✅</div>
                <h3 className="email-alert__title">You&apos;re signed up!</h3>
                <p className="email-alert__success">
                    We&apos;ll notify you when new senior animals are listed in your area.
                </p>
            </div>
        );
    }

    return (
        <div className="email-alert">
            <div className="email-alert__icon">🔔</div>
            <h3 className="email-alert__title">Get Notified</h3>
            <p className="email-alert__subtitle">
                Be the first to know when new senior animals need homes. We&apos;ll email you when new listings are posted.
            </p>
            <form className="email-alert__form" onSubmit={handleSubmit}>
                <input
                    className="email-alert__input"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-label="Email address for alerts"
                />
                <button
                    className="email-alert__submit"
                    type="submit"
                    disabled={loading || !email}
                >
                    {loading ? 'Signing up...' : 'Notify Me'}
                </button>
            </form>
        </div>
    );
}
