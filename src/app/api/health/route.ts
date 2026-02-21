import { NextResponse } from 'next/server';
import pg from 'pg';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const url = process.env.DATABASE_URL;
    const info: Record<string, unknown> = {
        hasUrl: !!url,
        urlHost: url ? new URL(url).hostname : null,
        nodeEnv: process.env.NODE_ENV,
    };

    if (!url) {
        return NextResponse.json({ ...info, error: 'DATABASE_URL not set' }, { status: 500 });
    }

    try {
        // Raw pg test
        const pool = new pg.Pool({
            connectionString: url,
            ssl: url.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
            connectionTimeoutMillis: 5000,
        });
        const result = await pool.query('SELECT COUNT(*) as count FROM animals');
        await pool.end();

        // Prisma test
        const prismaCount = await prisma.animal.count();

        return NextResponse.json({
            ...info,
            status: 'ok',
            animalCount: { raw: result.rows[0].count, prisma: prismaCount },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ...info, error: msg }, { status: 500 });
    }
}
