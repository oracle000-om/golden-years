import type { Metadata } from "next";
import Link from "next/link";
import { ErrorBoundary } from "@/components/error-boundary";
import { FactBubbles } from "@/components/fact-bubbles";
import "./globals.css";
import "./listings.css";
import "./detail.css";
import "./shelter.css";
import "./components.css";
import "./poll.css";

export const metadata: Metadata = {
  title: "Golden Years Club",
  description: "Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="container">
            <Link href="/" className="header__logo">
              <span className="header__logo-text">Golden Years Club</span>
            </Link>
            <nav>
              <ul className="header__nav">
                <li><Link href="/">List</Link></li>
                <li><Link href="/give">Give</Link></li>
                <li><Link href="/poll">Public Square</Link></li>
              </ul>
            </nav>
          </div>
        </header>

        <main>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>

        <footer className="footer">
          <div className="container">
            <p className="footer__quote">The last of life, for which the first was made.</p>
            <p>Golden Years Club &copy; 2026</p>
            <p className="footer__links">
              <Link href="/about">About</Link>
            </p>
          </div>
        </footer>

        <FactBubbles />
      </body>
    </html>
  );
}
