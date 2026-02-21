import { NextResponse } from 'next/server';
import pg from 'pg';

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

    try {
        const pool = new pg.Pool({
            connectionString: url,
            ssl: url.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 5000,
        });
        const result = await pool.query('SELECT COUNT(*) as count FROM animals');
        const count = result.rows[0].count;
        await pool.end();
        return NextResponse.json({ ...info, status: 'ok', animalCount: count });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ...info, error: msg }, { status: 500 });
    }
}
