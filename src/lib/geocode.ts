/**
 * Geocoding utilities for distance-based search.
 *
 * Uses Nominatim (OpenStreetMap) for zip → lat/lng geocoding.
 * Rate limit: 1 request/second (Nominatim policy) — enforced via
 * a simple per-second throttle to avoid IP-blocks.
 */

// ─── Haversine Distance ────────────────────────────────

const EARTH_RADIUS_MILES = 3958.8;

/** Calculate distance in miles between two lat/lng points. */
export function haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
): number {
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Zip Code Geocoding ────────────────────────────────

interface GeoResult {
    lat: number;
    lng: number;
}

// In-memory cache for geocoded zips (survives request lifetime in dev)
const zipCache = new Map<string, GeoResult | null>();

// ─── Rate Limiter (1 req/sec for Nominatim policy) ─────

let lastNominatimCall = 0;
const MIN_INTERVAL_MS = 1100; // slightly over 1 sec to be safe

async function throttledFetch(url: string, init: RequestInit): Promise<Response> {
    const now = Date.now();
    const elapsed = now - lastNominatimCall;
    if (elapsed < MIN_INTERVAL_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
    }
    lastNominatimCall = Date.now();
    return fetch(url, init);
}

/** Geocode a US zip code to lat/lng using Nominatim. */
export async function geocodeZip(zip: string): Promise<GeoResult | null> {
    if (!zip || zip.length !== 5) return null;

    // Check cache
    if (zipCache.has(zip)) return zipCache.get(zip) ?? null;

    try {
        const res = await throttledFetch(
            `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`,
            {
                headers: {
                    'User-Agent': 'GoldenYearsClub/1.0 (goldenyears.club)',
                    'Accept-Language': 'en',
                },
            },
        );

        if (!res.ok) {
            zipCache.set(zip, null);
            return null;
        }

        const data = await res.json();
        if (!data.length) {
            zipCache.set(zip, null);
            return null;
        }

        const result: GeoResult = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
        };
        zipCache.set(zip, result);
        return result;
    } catch {
        zipCache.set(zip, null);
        return null;
    }
}
