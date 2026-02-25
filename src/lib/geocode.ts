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

export interface GeoResultFull extends GeoResult {
    state: string | null; // two-letter state code, if available
}

// In-memory cache for geocoded zips (survives request lifetime in dev)
const zipCache = new Map<string, GeoResultFull | null>();

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

// US state name → abbreviation map for Nominatim display_name parsing
const STATE_ABBREV: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

/** Extract state abbreviation from Nominatim display_name (e.g., "92614, Irvine, CA, USA") */
function extractState(displayName: string): string | null {
    // Nominatim display_name usually contains state as a part
    const parts = displayName.split(',').map(p => p.trim());
    // Try to find a 2-letter state code directly
    for (const part of parts) {
        if (/^[A-Z]{2}$/.test(part) && Object.values(STATE_ABBREV).includes(part)) {
            return part;
        }
    }
    // Try full state name
    for (const part of parts) {
        const abbrev = STATE_ABBREV[part];
        if (abbrev) return abbrev;
    }
    return null;
}

/** Geocode a US zip code to lat/lng + state. */
export async function geocodeZipFull(zip: string): Promise<GeoResultFull | null> {
    if (!zip || zip.length !== 5) return null;

    // Check cache
    if (zipCache.has(zip)) return zipCache.get(zip) ?? null;

    try {
        const res = await throttledFetch(
            `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1&addressdetails=1`,
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

        // Try to get state from address details first, then display_name
        let state: string | null = null;
        if (data[0].address?.state) {
            state = STATE_ABBREV[data[0].address.state] || extractState(data[0].address.state);
        }
        if (!state && data[0].display_name) {
            state = extractState(data[0].display_name);
        }

        const result: GeoResultFull = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            state,
        };
        zipCache.set(zip, result);
        return result;
    } catch {
        zipCache.set(zip, null);
        return null;
    }
}

/** Geocode a US zip code to lat/lng (convenience wrapper). */
export async function geocodeZip(zip: string): Promise<GeoResult | null> {
    return geocodeZipFull(zip);
}

// ─── County Geocoding ──────────────────────────────────

// Separate cache for county lookups
const countyCache = new Map<string, GeoResult | null>();

/** Geocode a US county + state to approximate lat/lng (county centroid). */
export async function geocodeCounty(county: string, state: string): Promise<GeoResult | null> {
    if (!county || !state) return null;

    const cacheKey = `${county}|${state}`;
    if (countyCache.has(cacheKey)) return countyCache.get(cacheKey) ?? null;

    try {
        // Clean up county name (remove " County" suffix if present)
        const cleanCounty = county.replace(/\s+County$/i, '').trim();
        const res = await throttledFetch(
            `https://nominatim.openstreetmap.org/search?county=${encodeURIComponent(cleanCounty + ' County')}&state=${encodeURIComponent(state)}&country=US&format=json&limit=1`,
            {
                headers: {
                    'User-Agent': 'GoldenYearsClub/1.0 (goldenyears.club)',
                    'Accept-Language': 'en',
                },
            },
        );

        if (!res.ok) {
            countyCache.set(cacheKey, null);
            return null;
        }

        const data = await res.json();
        if (!data.length) {
            countyCache.set(cacheKey, null);
            return null;
        }

        const result: GeoResult = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
        };
        countyCache.set(cacheKey, result);
        return result;
    } catch {
        countyCache.set(cacheKey, null);
        return null;
    }
}
