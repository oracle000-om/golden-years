'use client';

import { useState } from 'react';

export default function JoinPage() {
    const [form, setForm] = useState({
        shelterName: '',
        website: '',
        email: '',
        contact: '',
        confirm: false,
    });
    const [submitted, setSubmitted] = useState(false);

    const canSubmit = form.shelterName.trim() && form.email.trim() && form.confirm;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;

        const subject = encodeURIComponent(`Best of Breed — ${form.shelterName}`);
        const body = encodeURIComponent(
            `Shelter Name: ${form.shelterName}\n` +
            `Website: ${form.website || 'N/A'}\n` +
            `Email: ${form.email}\n` +
            `Contact: ${form.contact || 'N/A'}\n\n` +
            `Confirmed understanding of Golden Years Club's focus on senior dogs and cats.`
        );
        window.open(`mailto:enter@daye.town?subject=${subject}&body=${body}`, '_self');
        setSubmitted(true);
    }

    if (submitted) {
        return (
            <section className="join-page">
                <div className="container">
                    <div className="join-success">
                        <div className="join-success__icon">🎉</div>
                        <h2 className="join-success__title">Request received!</h2>
                        <p className="join-success__text">
                            Thank you for your interest in joining the Golden Years Club database. We&apos;ll review your submission and be in touch soon.
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
                    <span className="page-badge">🏥 Join the Database</span>
                    <p className="join-page__subtitle">
                        Add your shelter to our directory and help senior animals find their forever homes.
                    </p>
                </header>

                <form className="join-form" onSubmit={handleSubmit}>
                    <div className="join-form__field">
                        <label htmlFor="shelterName" className="join-form__label">Shelter Name *</label>
                        <input
                            id="shelterName"
                            type="text"
                            className="join-form__input"
                            placeholder="e.g. Austin Animal Center"
                            value={form.shelterName}
                            onChange={(e) => setForm({ ...form, shelterName: e.target.value })}
                            required
                        />
                    </div>

                    <div className="join-form__field">
                        <label htmlFor="website" className="join-form__label">Website</label>
                        <input
                            id="website"
                            type="url"
                            className="join-form__input"
                            placeholder="https://www.example.org"
                            value={form.website}
                            onChange={(e) => setForm({ ...form, website: e.target.value })}
                        />
                    </div>

                    <div className="join-form__field">
                        <label htmlFor="email" className="join-form__label">Email *</label>
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
                        <label htmlFor="contact" className="join-form__label">Contact Name</label>
                        <input
                            id="contact"
                            type="text"
                            className="join-form__input"
                            placeholder="First and last name"
                            value={form.contact}
                            onChange={(e) => setForm({ ...form, contact: e.target.value })}
                        />
                    </div>

                    <label className="join-form__checkbox-label">
                        <input
                            type="checkbox"
                            className="join-form__checkbox"
                            checked={form.confirm}
                            onChange={(e) => setForm({ ...form, confirm: e.target.checked })}
                        />
                        <span>I understand that Golden Years Club specializes in senior dogs and cats.</span>
                    </label>

                    <button type="submit" className="join-form__submit" disabled={!canSubmit}>
                        Submit Request
                    </button>
                </form>
            </div>
        </section>
    );
}
