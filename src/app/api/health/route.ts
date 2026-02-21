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

    // Test 1: Raw pg connection + schema check
    let rawPgOk = false;
    let rawPgCount: string | null = null;
    let rawPgError: string | null = null;
    let dbColumns: string[] | null = null;
    let migrationStatus: string | null = null;
    try {
        const pool = new pg.Pool({
            connectionString: url,
            ssl: url.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 5000,
        });
        const result = await pool.query('SELECT COUNT(*) as count FROM animals');
        rawPgCount = result.rows[0].count;
        rawPgOk = true;

        // Check actual column names
        const colResult = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'animals' ORDER BY ordinal_position`);
        dbColumns = colResult.rows.map((r: { column_name: string }) => r.column_name);

        // Check migrations
        try {
            const migResult = await pool.query(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5`);
            migrationStatus = JSON.stringify(migResult.rows);
        } catch {
            migrationStatus = 'no _prisma_migrations table';
        }

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

    // Test 3: bare findMany (no where, no select)
    let bareOk = false;
    let bareError: string | null = null;
    try {
        const animals = await prisma.animal.findMany({ take: 1 });
        bareOk = true;
        // Also report what columns came back
        bareError = animals.length > 0 ? `cols: ${Object.keys(animals[0]).join(',')}` : 'empty table';
    } catch (e: unknown) {
        bareError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // Test 4: findMany with select (only safe scalar fields)
    let selectOk = false;
    let selectError: string | null = null;
    try {
        const animals = await prisma.animal.findMany({
            select: { id: true, name: true, species: true, status: true },
            take: 3,
        });
        selectOk = true;
        selectError = JSON.stringify(animals.map(a => ({ id: a.id.slice(0, 8), name: a.name, species: a.species, status: a.status })));
    } catch (e: unknown) {
        selectError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // Test 5: findMany with where enum filter
    let whereOk = false;
    let whereError: string | null = null;
    try {
        const animals = await prisma.animal.findMany({
            where: { status: 'LISTED' },
            select: { id: true, status: true },
            take: 1,
        });
        whereOk = true;
        whereError = `found ${animals.length}`;
    } catch (e: unknown) {
        whereError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // Test 6: findMany with include shelter
    let joinOk = false;
    let joinError: string | null = null;
    try {
        const animals = await prisma.animal.findMany({
            include: { shelter: true },
            take: 1,
        });
        joinOk = true;
        joinError = `found ${animals.length}`;
    } catch (e: unknown) {
        joinError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // Test 7: getDistinctStates query
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

    const allOk = rawPgOk && prismaOk && bareOk && selectOk && whereOk && joinOk && statesOk;
    return NextResponse.json({
        ...info,
        deployedAt: 'fd2d418-v3',
        status: allOk ? 'ok' : 'partial',
        rawPg: { ok: rawPgOk, animalCount: rawPgCount, error: rawPgError },
        dbSchema: { animalColumns: dbColumns, migrations: migrationStatus },
        prismaCount: { ok: prismaOk, count: prismaCount, error: prismaError },
        bareFindMany: { ok: bareOk, detail: bareError },
        selectFindMany: { ok: selectOk, detail: selectError },
        whereFindMany: { ok: whereOk, detail: whereError },
        joinFindMany: { ok: joinOk, detail: joinError },
        statesQuery: { ok: statesOk, states: statesResult, error: statesError },
    }, { status: allOk ? 200 : 500 });
}
