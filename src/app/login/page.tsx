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
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background)',
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: '360px',
                width: '100%',
                padding: '0 1.5rem',
            }}>
                <h1 style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '2rem',
                    marginBottom: '0.5rem',
                }}>
                    <span style={{ color: 'var(--gold)' }}>Golden Years</span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>Club</span>
                </h1>
                <p style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem',
                    marginBottom: '2rem',
                }}>
                    This site is password protected
                </p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '0.75rem 1rem',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--card-border)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                            outline: 'none',
                            marginBottom: '1rem',
                            boxSizing: 'border-box',
                        }}
                    />
                    <button
                        type="submit"
                        disabled={loading || !password}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            background: 'var(--gold)',
                            color: '#000',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: loading ? 'wait' : 'pointer',
                            opacity: loading || !password ? 0.6 : 1,
                            transition: 'opacity 0.2s',
                        }}
                    >
                        {loading ? 'Checking...' : 'Enter'}
                    </button>
                </form>

                {error && (
                    <p style={{
                        color: '#ef4444',
                        fontSize: '0.875rem',
                        marginTop: '1rem',
                    }}>
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
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)',
                color: 'var(--text-muted)',
            }}>
                Loading...
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}
