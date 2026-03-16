/**
 * Server-Side Page View Tracking
 *
 * Lightweight analytics — called from page.tsx server components.
 * No client JS needed. Captures path, entity IDs, search context,
 * and visitor region from Vercel headers.
 *
 * Privacy: No PII. sessionId is a random UUID (not tied to identity).
 * Region is country+state from Vercel's edge headers.
 */

import { prisma } from './db';
import { headers, cookies } from 'next/headers';

/**
 * Track a page view. Call from any page.tsx server component.
 * Non-blocking — errors are silently swallowed.
 */
export async function trackPageView(data: {
    path: string;
    animalId?: string;
    shelterId?: string;
    searchQuery?: string;
    filters?: Record<string, unknown>;
    product?: string;
}) {
    try {
        const headerStore = await headers();
        const cookieStore = await cookies();

        // Session ID: reuse existing or generate new
        let sessionId = cookieStore.get('_gyc_sid')?.value;
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            // Cookie will be set by middleware or next response
        }

        // Region from Vercel edge headers
        const country = headerStore.get('x-vercel-ip-country') || '';
        const regionCode = headerStore.get('x-vercel-ip-country-region') || '';
        const region = regionCode ? `${country}-${regionCode}` : country || null;

        const referrer = headerStore.get('referer') || null;

        await prisma.pageView.create({
            data: {
                path: data.path,
                animalId: data.animalId || null,
                shelterId: data.shelterId || null,
                searchQuery: data.searchQuery || null,
                filters: data.filters ? (data.filters as Record<string, unknown>) as any : undefined,
                referrer,
                region,
                product: data.product || 'gyc',
                sessionId,
            },
        });
    } catch {
        // Silent — analytics should never break the page
    }
}
