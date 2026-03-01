/**
 * GET  /api/v1/alerts/:id — Check alert status + current matches
 * DELETE /api/v1/alerts/:id — Deactivate an alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { searchSimilar } from '@/lib/embedding-singleton';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const getLimit = createRateLimiter('v1-alerts-get', 30);
const deleteLimit = createRateLimiter('v1-alerts-delete', 10);

/**
 * GET /api/v1/alerts/:id — Check alert status and find current matches.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const auth = await validateApiAuth(request);
    if (!auth.authenticated) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const ip = getClientIp(request);
    const limit = await getLimit.check(ip);
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // ── Fetch alert ──
    const alert = await prisma.petAlert.findUnique({ where: { id } });
    if (!alert) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    // ── Check expiration ──
    if (alert.status === 'ACTIVE' && new Date() > alert.expiresAt) {
        await prisma.petAlert.update({
            where: { id },
            data: { status: 'EXPIRED' },
        });
        alert.status = 'EXPIRED';
    }

    // ── Find matches via Zilliz (through Python worker) ──
    let matches: any[] = [];
    const embedding = alert.photoEmbedding;

    if (embedding && embedding.length === 2048) {
        try {
            const searchResults = await searchSimilar(embedding, {
                species: alert.species,
                limit: 10,
                threshold: 0.70,
            });

            if (searchResults.length > 0) {
                const animalIds = searchResults.map(m => m.id);
                const animals = await prisma.animal.findMany({
                    where: { id: { in: animalIds } },
                    select: {
                        id: true,
                        name: true,
                        breed: true,
                        species: true,
                        photoUrl: true,
                        status: true,
                        shelter: {
                            select: { id: true, name: true, state: true, county: true },
                        },
                    },
                });

                const animalMap = new Map(animals.map((a: any) => [a.id, a]));
                matches = searchResults
                    .map(m => {
                        const animal = animalMap.get(m.id);
                        if (!animal) return null;
                        return { ...animal, similarity: m.similarity, source: 'shelter' };
                    })
                    .filter(Boolean);
            }
        } catch (err) {
            console.error('[alerts/:id] Match search failed:', (err as Error).message);
        }
    }

    const { contactEmail, contactPhone, photoEmbedding, ...safeAlert } = alert;

    return NextResponse.json({ alert: safeAlert, matches });
}

/**
 * DELETE /api/v1/alerts/:id — Deactivate an alert.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const auth = await validateApiAuth(request);
    if (!auth.authenticated) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const ip = getClientIp(request);
    const limit = await deleteLimit.check(ip);
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const alert = await prisma.petAlert.findUnique({ where: { id } });
    if (!alert) {
        return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    if (alert.status === 'DEACTIVATED') {
        return NextResponse.json({ success: true, status: 'DEACTIVATED' });
    }

    await prisma.petAlert.update({
        where: { id },
        data: { status: 'DEACTIVATED', deactivatedAt: new Date() },
    });

    return NextResponse.json({ success: true, status: 'DEACTIVATED' });
}
