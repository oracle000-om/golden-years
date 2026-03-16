/**
 * Outbound Click Tracking API
 *
 * POST /api/track/click
 * Records when a user clicks through to a shelter's adoption page.
 * This is the closest proxy for "did this listing lead to an adoption inquiry?"
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { animalId, shelterId, destination } = body;

        if (!animalId || !shelterId || !destination) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const sessionId = req.cookies.get('_gyc_sid')?.value || 'anonymous';

        await prisma.outboundClick.create({
            data: {
                animalId,
                shelterId,
                destination,
                sessionId,
                product: 'gyc',
            },
        });

        return NextResponse.json({ ok: true });
    } catch {
        // Silent — don't break the user experience
        return NextResponse.json({ ok: true });
    }
}
