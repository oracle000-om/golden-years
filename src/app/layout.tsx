import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
              Golden Years <span>Club</span>
            </Link>
            <nav>
              <ul className="header__nav">
                <li><Link href="/listings">Listings</Link></li>
                <li><Link href="/about">About</Link></li>
              </ul>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div className="container">
            <p className="footer__haiku">
              A long life I&apos;ve lived<br />
              Only to die in a cage<br />
              Held by a stranger
            </p>
            <p>Golden Years Club — Every senior deserves a gentle ending.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
