'use client';

import { useState, type FormEvent } from 'react';

export function FeedbackForm() {
    const [firstName, setFirstName] = useState('');
    const [email, setEmail] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (isSubmitting || !firstName.trim() || !note.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: firstName.trim(),
                    email: email.trim() || null,
                    note: note.trim(),
                }),
            });

            if (res.ok) {
                setSubmitted(true);
            } else {
                const data = await res.json();
                setError(data.error || 'Something went wrong.');
            }
        } catch {
            setError('Unable to send feedback. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    if (submitted) {
        return (
            <div className="feedback">
                <div className="feedback__success">
                    <span className="feedback__success-icon">💛</span>
                    <p className="feedback__success-text">Thank you for your feedback!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="feedback">
            <h3 className="feedback__heading">What you can give in the meantime</h3>
            <p className="feedback__subtext">
                We appreciate your feedback to make Golden Years Club better.
            </p>

            <form className="feedback__form" onSubmit={handleSubmit}>
                <div className="feedback__field">
                    <label htmlFor="feedback-name" className="feedback__label">First name</label>
                    <input
                        id="feedback-name"
                        type="text"
                        className="feedback__input"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Your first name"
                        maxLength={100}
                        required
                    />
                </div>

                <div className="feedback__field">
                    <label htmlFor="feedback-email" className="feedback__label">
                        Email <span className="feedback__optional">(optional)</span>
                    </label>
                    <input
                        id="feedback-email"
                        type="email"
                        className="feedback__input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        maxLength={255}
                    />
                </div>

                <div className="feedback__field">
                    <label htmlFor="feedback-note" className="feedback__label">Note</label>
                    <textarea
                        id="feedback-note"
                        className="feedback__textarea"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="What's on your mind?"
                        maxLength={2000}
                        rows={4}
                        required
                    />
                </div>

                {error && <p className="feedback__error">{error}</p>}

                <button
                    type="submit"
                    className="feedback__submit"
                    disabled={isSubmitting || !firstName.trim() || !note.trim()}
                >
                    {isSubmitting ? 'Sending…' : 'Submit'}
                </button>
            </form>
        </div>
    );
}
