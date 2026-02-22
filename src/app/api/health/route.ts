import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Require API key in production
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.HEALTH_API_KEY;
    if (expectedKey && apiKey !== expectedKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const prismaCount = await prisma.animal.count();
        return NextResponse.json({
            status: 'ok',
            animalCount: prismaCount,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
