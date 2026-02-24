import Link from 'next/link';
import '../admin.css';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="admin-layout">
            <nav className="admin-nav">
                <div className="admin-nav__brand">
                    <Link href="/admin" className="admin-nav__logo">
                        ⚙️ <span className="admin-nav__logo-text">Admin</span>
                    </Link>
                </div>
                <div className="admin-nav__links">
                    <Link href="/admin" className="admin-nav__link">Overview</Link>
                    <Link href="/admin/animals" className="admin-nav__link">Animals</Link>
                    <Link href="/admin/shelters" className="admin-nav__link">Shelters</Link>
                    <Link href="/" className="admin-nav__link admin-nav__link--back">← Site</Link>
                </div>
            </nav>
            <main className="admin-main">
                {children}
            </main>
        </div>
    );
}
