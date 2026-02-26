/**
 * Geocode Shelters — Batch geocoding enrichment
 *
 * Geocodes all shelters that have an address but no lat/lng.
 * Uses the US Census Bureau geocoding API (free, no API key required).
 *
 * Usage:
 *   npx tsx scraper/geocode-shelters.ts              # full batch
 *   npx tsx scraper/geocode-shelters.ts --dry-run     # preview only
 *   npx tsx scraper/geocode-shelters.ts --limit=50    # limit count
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

const CENSUS_API = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const RATE_LIMIT_MS = 500; // Census API rate limit: be polite
const MAX_RETRIES = 2;

interface GeocodeResult {
    lat: number;
    lng: number;
    matchedAddress: string;
}

/**
 * Geocode a single address using the US Census Bureau geocoder.
 * Free, no API key, returns lat/lng for US addresses.
 */
async function geocodeAddress(address: string, city: string, state: string): Promise<GeocodeResult | null> {
    const fullAddress = `${address}, ${city}, ${state}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const params = new URLSearchParams({
                address: fullAddress,
                benchmark: 'Public_AR_Current',
                format: 'json',
            });

            const response = await fetch(`${CENSUS_API}?${params}`, {
                signal: AbortSignal.timeout(10_000),
                headers: { 'User-Agent': 'GoldenYearsClub/1.0 (shelter-geocoding)' },
            });

            if (!response.ok) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                return null;
            }

            const data = await response.json() as any;
            const matches = data?.result?.addressMatches;

            if (!matches || matches.length === 0) return null;

            const match = matches[0];
            const coords = match.coordinates;

            if (coords?.x && coords?.y) {
                return {
                    lat: coords.y,
                    lng: coords.x,
                    matchedAddress: match.matchedAddress || fullAddress,
                };
            }

            return null;
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            return null;
        }
    }
    return null;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;

    console.log(`📍 Golden Years Club — Shelter Geocoding${dryRun ? ' (DRY RUN)' : ''}`);

    const prisma = await createPrismaClient();

    // Find shelters with address but no coordinates
    const shelters = await (prisma as any).shelter.findMany({
        where: {
            address: { not: null },
            latitude: null,
        },
        select: {
            id: true,
            name: true,
            address: true,
            county: true, // city is stored as county in some cases
            state: true,
        },
        ...(limit ? { take: limit } : {}),
    });

    console.log(`   Found ${shelters.length} shelters needing geocoding`);

    if (shelters.length === 0) {
        console.log('   ✅ All shelters already geocoded!');
        await prisma.$disconnect();
        return;
    }

    if (dryRun) {
        for (const s of shelters.slice(0, 20)) {
            console.log(`   📍 ${s.name} — ${s.address}, ${s.county}, ${s.state}`);
        }
        console.log(`\n✅ Dry run: ${shelters.length} shelters would be geocoded.`);
        await prisma.$disconnect();
        return;
    }

    let geocoded = 0;
    let failed = 0;
    const startTime = Date.now();

    for (let i = 0; i < shelters.length; i++) {
        const shelter = shelters[i];
        const city = shelter.county || '';  // city stored in county field

        const result = await geocodeAddress(shelter.address || '', city, shelter.state);

        if (result) {
            await (prisma as any).shelter.update({
                where: { id: shelter.id },
                data: {
                    latitude: result.lat,
                    longitude: result.lng,
                },
            });
            geocoded++;

            if (geocoded % 50 === 0 || i === shelters.length - 1) {
                console.log(`   ✅ ${geocoded} geocoded, ${failed} failed (${i + 1}/${shelters.length})`);
            }
        } else {
            failed++;
            if (failed <= 10) {
                console.log(`   ❌ Failed: ${shelter.name} — ${shelter.address}, ${city}, ${shelter.state}`);
            }
        }

        // Rate limit
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n🏁 Geocoding complete in ${elapsed}s`);
    console.log(`   ✅ ${geocoded} shelters geocoded`);
    console.log(`   ❌ ${failed} failed (missing/bad addresses)`);
    console.log(`   📊 Success rate: ${((geocoded / shelters.length) * 100).toFixed(1)}%`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
