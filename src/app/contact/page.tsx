'use client';

import { useState } from 'react';

export default function ContactPage() {
    const [form, setForm] = useState({
        name: '',
        shelter: '',
        email: '',
        subject: '',
        message: '',
    });
    const [submitted, setSubmitted] = useState(false);

    const canSubmit = form.email.trim() && form.shelter.trim() && form.subject.trim() && form.message.trim();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;

        const subject = encodeURIComponent(form.subject || `Shelter Partnership — ${form.shelter}`);
        const body = encodeURIComponent(
            `Name: ${form.name || 'N/A'}\n` +
            `Shelter: ${form.shelter}\n` +
            `Email: ${form.email}\n\n` +
            `${form.message}`
        );
        window.open(`mailto:enter@daye.town?subject=${subject}&body=${body}`, '_self');
        setSubmitted(true);
    }

    if (submitted) {
        return (
            <section className="join-page">
                <div className="container">
                    <div className="join-success">
                        <div className="join-success__icon">🤝</div>
                        <h2 className="join-success__title">Message sent!</h2>
                        <p className="join-success__text">
                            Thank you for reaching out. We&apos;ll get back to you as soon as we can.
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="join-page">
            <div className="container">
                <header className="join-page__header">
                    <span className="page-badge">🤝 Shelter Partnerships</span>
                    <p className="join-page__subtitle">
                        Does your shelter belong here? Tell us about it.
                    </p>
                </header>

                <form className="join-form" onSubmit={handleSubmit}>
                    <div className="join-form__field">
                        <label htmlFor="name" className="join-form__label">Name</label>
                        <input
                            id="name"
                            type="text"
                            className="join-form__input"
                            placeholder="Your name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </div>

                    <div className="join-form__field">
                        <label htmlFor="shelter" className="join-form__label">Shelter *</label>
                        <input
                            id="shelter"
                            type="text"
                            className="join-form__input"
                            placeholder="e.g. Austin Animal Center"
                            value={form.shelter}
                            onChange={(e) => setForm({ ...form, shelter: e.target.value })}
                            required
                        />
                    </div>

                    <div className="join-form__field">
                        <label htmlFor="email" className="join-form__label">Shelter Email *</label>
                        <input
                            id="email"
                            type="email"
                            className="join-form__input"
                            placeholder="contact@shelter.org"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="join-form__field">
                        <label htmlFor="subject" className="join-form__label">Subject *</label>
                        <input
                            id="subject"
                            type="text"
                            className="join-form__input"
                            placeholder="e.g. Data correction, partnership, listing request"
                            value={form.subject}
                            onChange={(e) => setForm({ ...form, subject: e.target.value.slice(0, 100) })}
                            required
                            maxLength={100}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', textAlign: 'right' }}>{form.subject.length}/100</span>
                    </div>

                    <div className="join-form__field">
                        <label htmlFor="message" className="join-form__label">Message *</label>
                        <textarea
                            id="message"
                            className="join-form__input"
                            placeholder="Tell us more about your shelter and how we can work together..."
                            rows={5}
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value.slice(0, 1000) })}
                            required
                            maxLength={1000}
                            style={{ resize: 'vertical' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', textAlign: 'right' }}>{form.message.length}/1000</span>
                    </div>

                    <button type="submit" className="join-form__submit" disabled={!canSubmit}>
                        Send Message
                    </button>
                </form>
            </div>
        </section>
    );
}
