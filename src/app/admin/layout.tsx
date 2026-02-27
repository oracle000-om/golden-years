'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import '../admin.css';

const NAV_LINKS = [
    { href: '/admin', label: 'Overview', exact: true },
    { href: '/admin/data-health', label: 'Data Health' },
    { href: '/admin/animals', label: 'Animals' },
    { href: '/admin/organizations', label: 'Organizations' },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className="admin-layout">
            <nav className="admin-nav">
                <div className="admin-nav__brand">
                    <Link href="/admin" className="admin-nav__logo">
                        ⚙️ <span className="admin-nav__logo-text">Admin</span>
                    </Link>
                </div>
                <div className="admin-nav__links">
                    {NAV_LINKS.map(({ href, label, exact }) => {
                        const isActive = exact
                            ? pathname === href
                            : pathname.startsWith(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`admin-nav__link${isActive ? ' admin-nav__link--active' : ''}`}
                            >
                                {label}
                            </Link>
                        );
                    })}
                    <Link href="/" className="admin-nav__link admin-nav__link--back">← Site</Link>
                </div>
            </nav>
            <main className="admin-main">
                {children}
            </main>
            <footer className="admin-footer">
                Dashboard loaded at {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </footer>
        </div>
    );
}
