/**
 * GET /api/admin/re-entries — List re-entry candidates
 * PATCH /api/admin/re-entries — Confirm or reject a candidate
 *
 * Admin-only endpoints for the re-entry review queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Build journey timeline for a confirmed identity.
 * Inlined here because scraper/ is outside src/ and can't be imported.
 */
async function buildJourneyTimeline(identityId: string) {
    const animals = await (prisma as any).animal.findMany({
        where: { identityId },
        select: {
            id: true, name: true, status: true,
            intakeDate: true, outcomeDate: true, delistedAt: true, createdAt: true,
            shelter: { select: { id: true, name: true, state: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const timeline: Array<{ animalId: string; shelterName: string; shelterId: string; event: string; date: string }> = [];
    for (const animal of animals) {
        const shelterName = `${animal.shelter.name} (${animal.shelter.state})`;
        timeline.push({
            animalId: animal.id, shelterName, shelterId: animal.shelter.id,
            event: 'INTAKE',
            date: (animal.intakeDate || animal.createdAt).toISOString(),
        });
        if (['ADOPTED', 'TRANSFERRED', 'RETURNED_OWNER', 'EUTHANIZED', 'DELISTED'].includes(animal.status)) {
            timeline.push({
                animalId: animal.id, shelterName, shelterId: animal.shelter.id,
                event: animal.status,
                date: (animal.outcomeDate || animal.delistedAt || animal.createdAt).toISOString(),
            });
        }
    }
    return timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * GET ?status=PENDING_REVIEW — List candidates with animal details
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING_REVIEW';

    const candidates = await (prisma as any).reEntryCandidate.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
            animal: {
                select: {
                    id: true,
                    name: true,
                    breed: true,
                    species: true,
                    sex: true,
                    photoUrl: true,
                    status: true,
                    intakeDate: true,
                    createdAt: true,
                    ageSegment: true,
                    intakeReason: true,
                    shelter: { select: { id: true, name: true, state: true, county: true } },
                },
            },
            matchedAnimal: {
                select: {
                    id: true,
                    name: true,
                    breed: true,
                    species: true,
                    sex: true,
                    photoUrl: true,
                    status: true,
                    intakeDate: true,
                    createdAt: true,
                    ageSegment: true,
                    intakeReason: true,
                    shelter: { select: { id: true, name: true, state: true, county: true } },
                },
            },
        },
    });

    return NextResponse.json({ candidates, count: candidates.length });
}

/**
 * PATCH — Confirm or reject a re-entry candidate
 * Body: { id, action: 'CONFIRM' | 'REJECT', reviewedBy? }
 */
export async function PATCH(request: NextRequest) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { id, action, reviewedBy } = body;
    if (!id || !action) {
        return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }
    if (!['CONFIRM', 'REJECT'].includes(action)) {
        return NextResponse.json({ error: 'action must be CONFIRM or REJECT' }, { status: 400 });
    }

    // Fetch the candidate
    const candidate = await (prisma as any).reEntryCandidate.findUnique({
        where: { id },
        include: {
            animal: { select: { id: true, shelterId: true, createdAt: true } },
            matchedAnimal: { select: { id: true, shelterId: true, createdAt: true } },
        },
    });

    if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    if (action === 'REJECT') {
        await (prisma as any).reEntryCandidate.update({
            where: { id },
            data: {
                status: 'REJECTED',
                reviewedBy: reviewedBy || null,
                reviewedAt: new Date(),
            },
        });

        return NextResponse.json({ status: 'rejected', id });
    }

    // CONFIRM — create or find AnimalIdentity, link both animals
    const earlierAnimal = candidate.animal.createdAt <= candidate.matchedAnimal.createdAt
        ? candidate.animal
        : candidate.matchedAnimal;

    // Check if either animal already has an identity
    const existingAnimals = await (prisma as any).animal.findMany({
        where: { id: { in: [candidate.animalId, candidate.matchedAnimalId] } },
        select: { id: true, identityId: true },
    });

    let identityId: string | null = null;
    for (const a of existingAnimals) {
        if (a.identityId) {
            identityId = a.identityId;
            break;
        }
    }

    if (!identityId) {
        // Create new identity
        const identity = await (prisma as any).animalIdentity.create({
            data: {
                firstSeenAt: earlierAnimal.createdAt,
                isReEntry: true,
            },
        });
        identityId = identity.id;
    } else {
        // Update existing identity
        await (prisma as any).animalIdentity.update({
            where: { id: identityId },
            data: { isReEntry: true },
        });
    }

    // Link both animals to the identity
    await (prisma as any).animal.updateMany({
        where: { id: { in: [candidate.animalId, candidate.matchedAnimalId] } },
        data: { identityId },
    });

    // Build journey timeline
    const journey = await buildJourneyTimeline(identityId!);
    await (prisma as any).animalIdentity.update({
        where: { id: identityId },
        data: { journeyJson: journey },
    });

    // Update candidate status
    await (prisma as any).reEntryCandidate.update({
        where: { id },
        data: {
            status: 'CONFIRMED',
            reviewedBy: reviewedBy || null,
            reviewedAt: new Date(),
        },
    });

    return NextResponse.json({
        status: 'confirmed',
        id,
        identityId,
        journeySteps: journey.length,
    });
}
