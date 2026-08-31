import type { Metadata, Viewport } from 'next';

import './globals.css';

import { SiteFooter } from '@/components/footer';
import { SiteHeader } from '@/components/header';
import { getSiteUrl } from '@/lib/env';

function metadataBase(): URL | undefined {
  try {
    return new URL(getSiteUrl());
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: 'learndev shop',
    template: '%s | learndev shop',
  },
  description:
    'Storefront for the learndev microservices lab: Next.js in front of NestJS account and product services.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * The header reads the session cookie, so every route below this layout is rendered
 * per request rather than statically. That is the correct trade for a personalised
 * page; the public catalogue data underneath is still cached by the fetch layer.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="container-page flex-1 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
