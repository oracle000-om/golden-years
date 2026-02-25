'use client';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="animal-detail">
            <div className="container">
                <div className="error-state">
                    <div className="error-state__icon">⚠️</div>
                    <h2 className="error-state__title">Something went wrong</h2>
                    <p className="error-state__text">
                        We hit an unexpected error loading this page.
                        This is usually temporary — please try again.
                    </p>
                    {error.digest && (
                        <p className="error-state__text" style={{ fontSize: 'var(--font-size-xs)', opacity: 0.5 }}>
                            Error ID: {error.digest}
                        </p>
                    )}
                    <button onClick={reset} className="error-state__retry">
                        Try again →
                    </button>
                </div>
            </div>
        </div>
    );
}
