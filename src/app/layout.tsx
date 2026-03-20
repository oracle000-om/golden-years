import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ErrorBoundary } from "@/components/error-boundary";
import { FactBubbles } from "@/components/fact-bubbles";
import { AdminToolbar } from "@/components/admin-toolbar";
import { StagingBanner } from "@/components/staging-banner";
import "./globals.css";
import "./listings.css";
import "./detail.css";
import "./shelter.css";
import "./components.css";
import "./poll.css";
import "./give.css";

export const metadata: Metadata = {
  title: "Golden Years Club",
  description: "Surfacing senior animals on shelter euthanasia lists — giving them visibility, dignity, and a last chance.",
  manifest: "/manifest.json",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Golden Years",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#c8a55a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap"
          media="print"
          id="google-fonts"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('google-fonts').addEventListener('load',function(){this.media='all'})`,
          }}
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700&display=swap"
          />
        </noscript>
      </head>
      <body>
        <StagingBanner />
        <header className="header">
          <div className="container">
            <Link href="/" className="header__logo">
              <span className="header__logo-text">Golden Years Club</span>
            </Link>
            <nav>
              <ul className="header__nav">
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
              <span className="footer__sep">·</span>
              <Link href="/best-of-breed">Best of Breed</Link>
            </p>
          </div>
        </footer>

        <FactBubbles />
        <AdminToolbar />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`,
          }}
        />
      </body>
    </html>
  );
}
