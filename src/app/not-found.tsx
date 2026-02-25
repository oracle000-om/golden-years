import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Page Not Found | Golden Years Club',
    description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
    return (
        <div className="animal-detail">
            <div className="container">
                <div className="error-state">
                    <div className="error-state__icon">🐾</div>
                    <h2 className="error-state__title">Page not found</h2>
                    <p className="error-state__text">
                        This page doesn&apos;t exist or may have been removed.
                        The animal you&apos;re looking for may have been adopted!
                    </p>
                    <Link href="/" className="error-state__retry">
                        ← Back to listings
                    </Link>
                </div>
            </div>
        </div>
    );
}
