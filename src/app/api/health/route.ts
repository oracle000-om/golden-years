import { NextResponse } from 'next/server';
import pg from 'pg';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const url = process.env.DATABASE_URL;
    const info: Record<string, unknown> = {
        hasUrl: !!url,
        urlHost: url ? new URL(url).hostname : null,
        urlPort: url ? new URL(url).port : null,
        nodeEnv: process.env.NODE_ENV,
    };

    if (!url) {
        return NextResponse.json({ ...info, error: 'DATABASE_URL not set' }, { status: 500 });
    }

    // Test 1: Raw pg connection
    let rawPgOk = false;
    let rawPgCount: string | null = null;
    let rawPgError: string | null = null;
    try {
        const pool = new pg.Pool({
            connectionString: url,
            ssl: url.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 5000,
        });
        const result = await pool.query('SELECT COUNT(*) as count FROM animals');
        rawPgCount = result.rows[0].count;
        rawPgOk = true;
        await pool.end();
    } catch (e: unknown) {
        rawPgError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // Test 2: Prisma client connection (simple count)
    let prismaOk = false;
    let prismaCount: number | null = null;
    let prismaError: string | null = null;
    try {
        prismaCount = await prisma.animal.count();
        prismaOk = true;
    } catch (e: unknown) {
        prismaError = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack?.split('\n').slice(0, 5).join('\n')}` : String(e);
    }

    // Test 3: The exact query used by the main listings page
    let queryOk = false;
    let queryCount: number | null = null;
    let queryError: string | null = null;
    try {
        const animals = await prisma.animal.findMany({
            where: { status: { in: ['LISTED', 'URGENT'] } },
            include: { shelter: true },
            orderBy: [
                { euthScheduledAt: { sort: 'asc', nulls: 'last' } },
                { createdAt: 'desc' },
            ],
        });
        queryCount = animals.length;
        queryOk = true;
    } catch (e: unknown) {
        queryError = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack?.split('\n').slice(0, 5).join('\n')}` : String(e);
    }

    // Test 4: getDistinctStates query
    let statesOk = false;
    let statesResult: string[] | null = null;
    let statesError: string | null = null;
    try {
        const shelters = await prisma.shelter.findMany({ select: { state: true } });
        statesResult = [...new Set(shelters.map((s: { state: string }) => s.state.toUpperCase()))].sort();
        statesOk = true;
    } catch (e: unknown) {
        statesError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    const allOk = rawPgOk && prismaOk && queryOk && statesOk;
    return NextResponse.json({
        ...info,
        status: allOk ? 'ok' : 'partial',
        rawPg: { ok: rawPgOk, animalCount: rawPgCount, error: rawPgError },
        prismaCount: { ok: prismaOk, animalCount: prismaCount, error: prismaError },
        listingsQuery: { ok: queryOk, animalCount: queryCount, error: queryError },
        statesQuery: { ok: statesOk, states: statesResult, error: statesError },
    }, { status: allOk ? 200 : 500 });
}
