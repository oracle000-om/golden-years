/**
 * Image Proxy — Golden Years Club
 *
 * Proxies shelter animal photos to avoid hotlinking issues
 * and adds caching headers. Only allows images from known
 * shelter domains.
 *
 * Usage: /api/image-proxy?url=<encoded photo URL>
 */

import { NextRequest, NextResponse } from 'next/server';

// Allowed shelter image domains
const ALLOWED_DOMAINS = [
    'dl5zpyw5k3jeb.cloudfront.net',  // RescueGroups CDN
    'g.petango.com',                  // Petango/PetPoint
    '24petconnect.com',
    'www.shelterluv.com',
    'cdn.shelterluv.com',
    'cdn.rescuegroups.org',
    'images.petango.com',
    'www.sanantonio.gov',
    'www.sdhumane.org',
    'animalfoundation.com',
    'countypets.com',
    'photos.adoptapet.com',
    'daccanimalimagesprod.blob.core.windows.net',
    'petadoption.ocpetinfo.com',
    'dbw3zep4prcju.cloudfront.net',  // Petfinder CDN
    'psl.petfinder.com',
    'photos.petfinder.com',
    'media.adoptapet.com',
    // Add more as shelters are onboarded — avoid shared hosting
    // domains like storage.googleapis.com (any bucket would pass).
];

function isAllowedUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    if (!isAllowedUrl(url)) {
        return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
            headers: {
                'User-Agent': 'GoldenYearsClub/1.0 ImageProxy',
                'Accept': 'image/*',
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
            return NextResponse.json({ error: 'Not an image' }, { status: 400 });
        }

        const imageBuffer = await response.arrayBuffer();

        return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
                'X-Proxy-Source': 'golden-years-image-proxy',
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: `Proxy error: ${(err as Error).message}` },
            { status: 502 },
        );
    }
}
