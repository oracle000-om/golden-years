'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                router.push('/admin');
                router.refresh();
            } else {
                const data = await res.json();
                setError(data.error || 'Wrong password');
                setPassword('');
            }
        } catch {
            setError('Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-login">
            <div className="admin-login__card">
                <h1 className="admin-login__title">
                    <span className="admin-login__title-gold">Admin</span>{' '}
                    <span className="admin-login__title-dim">Dashboard</span>
                </h1>
                <p className="admin-login__subtitle">
                    Restricted access
                </p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Admin password"
                        autoFocus
                        className="admin-login__input"
                    />
                    <button
                        type="submit"
                        disabled={loading || !password}
                        className="admin-login__submit"
                    >
                        {loading ? 'Verifying...' : 'Enter'}
                    </button>
                </form>

                {error && (
                    <p className="admin-login__error">
                        {error}
                    </p>
                )}
            </div>
        </div>
    );
}
