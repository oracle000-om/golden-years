/**
 * GET /api/suggest?q=...&limit=8
 * Returns categorized typeahead suggestions from actual data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams.get('q')?.trim() || '';
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '8', 10), 20);

    if (q.length < 2) {
        return NextResponse.json({ breeds: [], locations: [], shelters: [] });
    }

    const pattern = `%${q}%`;

    // Run all queries in parallel
    const [breedRows, locationRows, shelterRows] = await Promise.all([
        // Distinct breeds matching query
        prisma.$queryRaw<{ breed: string }[]>`
            SELECT DISTINCT breed FROM animals
            WHERE breed IS NOT NULL
              AND breed ILIKE ${pattern}
              AND status IN ('AVAILABLE', 'URGENT')
            ORDER BY breed
            LIMIT ${limit}
        `,

        // Distinct cities / counties matching query
        prisma.$queryRaw<{ county: string; state: string }[]>`
            SELECT DISTINCT county, state FROM shelters
            WHERE county ILIKE ${pattern}
            ORDER BY county
            LIMIT ${limit}
        `,

        // Shelter names matching query
        prisma.$queryRaw<{ id: string; name: string; county: string; state: string }[]>`
            SELECT id, name, county, state FROM shelters
            WHERE name ILIKE ${pattern}
            ORDER BY name
            LIMIT ${limit}
        `,
    ]);

    return NextResponse.json({
        breeds: breedRows.map((r) => ({
            type: 'breed' as const,
            label: r.breed,
            value: r.breed,
        })),
        locations: locationRows.map((r) => ({
            type: 'location' as const,
            label: `${r.county}, ${r.state}`,
            value: r.county,
        })),
        shelters: shelterRows.map((r) => ({
            type: 'shelter' as const,
            label: r.name,
            sublabel: `${r.county}, ${r.state}`,
            value: r.name,
            id: r.id,
        })),
    });
}
