'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get('from') || '/';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                router.push(from);
                router.refresh();
            } else {
                setError('Wrong password');
                setPassword('');
            }
        } catch {
            setError('Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <h1 className="login-card__title">
                    <span className="login-card__title-gold">Golden Years</span>{' '}
                    <span className="login-card__title-dim">Club</span>
                </h1>
                <p className="login-card__subtitle">
                    This site is password protected
                </p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        autoFocus
                        className="login-card__input"
                    />
                    <button
                        type="submit"
                        disabled={loading || !password}
                        className="login-card__submit"
                    >
                        {loading ? 'Checking...' : 'Enter'}
                    </button>
                </form>

                {error && (
                    <p className="login-card__error">
                        {error}
                    </p>
                )}
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="login-page login-page--loading">
                Loading...
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}

