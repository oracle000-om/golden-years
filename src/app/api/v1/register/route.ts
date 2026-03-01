/**
 * POST /api/v1/register — Register a Found or Lost Pet
 *
 * Accepts both:
 *   - multipart/form-data: { image, report_type, species, pet_name, ... }  (Sniff)
 *   - application/json:    { type, species, photoUrl, contact, ... }       (API)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { getEmbedding, getEmbeddingFromBytes, searchSimilar, embedAndInsert } from '@/lib/embedding-singleton';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter('v1-register', 10);

export async function POST(request: NextRequest) {
    const auth = await validateApiAuth(request);
    if (!auth.authenticated) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const ip = getClientIp(request);
    const limit = await limiter.check(ip);
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        return handleFormData(request);
    } else {
        return handleJson(request);
    }
}

/** Handle Sniff-style FormData registration */
async function handleFormData(request: NextRequest) {
    const formData = await request.formData();

    const file = formData.get('image') as File | null;
    const reportType = (formData.get('report_type') as string) || 'found_pet';
    const petName = (formData.get('pet_name') as string) || 'Unknown';
    const species = ((formData.get('species') as string) || 'unknown').toUpperCase();
    const finderName = (formData.get('finder_name') as string) || '';
    const finderContact = (formData.get('finder_contact') as string) || '';
    const locationFound = (formData.get('location_found') as string) || '';
    const notes = (formData.get('notes') as string) || '';

    // Map Sniff's report_type to our type
    const type = reportType === 'lost_pet' ? 'LOST' : 'FOUND';

    // Generate embedding from uploaded file
    let embedding: number[] | null = null;
    if (file && file.size > 0 && file.size < 10 * 1024 * 1024) {
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        embedding = await getEmbeddingFromBytes(base64);
    }

    // Create PetAlert
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const alert = await prisma.petAlert.create({
        data: {
            type,
            species: (['DOG', 'CAT', 'OTHER'].includes(species) ? species : 'OTHER') as any,
            name: petName.trim() || null,
            description: notes.trim() || null,
            photoEmbedding: embedding ?? [],
            embeddingModel: embedding ? 'resnet50-imagenet-v1' : null,
            locationText: locationFound.trim() || null,
            contactEmail: finderContact.trim() || 'unknown@sniff.app',
            contactName: finderName.trim() || null,
            expiresAt,
        },
    });

    // Check for cross-matches
    let initialMatches: any[] = [];
    if (embedding) {
        try {
            initialMatches = await searchSimilar(embedding, {
                species: ['DOG', 'CAT'].includes(species) ? species : undefined,
                limit: 5,
                threshold: 0.75,
            });
        } catch { /* non-fatal */ }
    }

    return NextResponse.json({
        status: 'success',
        pet_id: alert.id,
        pet_name: petName,
        alert_id: alert.id,
        initial_matches: initialMatches.length,
    }, { status: 201 });
}

/** Handle JSON API registration */
async function handleJson(request: NextRequest) {
    let body: any;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { type, species, breed, name, description, photoUrl, location, contact, radiusMiles } = body;

    if (!type || !['LOST', 'FOUND'].includes(type?.toUpperCase())) {
        return NextResponse.json({ error: 'type must be "LOST" or "FOUND"' }, { status: 400 });
    }
    if (!contact?.email) {
        return NextResponse.json({ error: 'contact.email is required' }, { status: 400 });
    }

    const normalizedSpecies = (species ?? 'DOG').toUpperCase();

    let embedding: number[] | null = null;
    if (photoUrl && typeof photoUrl === 'string') {
        try { new URL(photoUrl); embedding = await getEmbedding(photoUrl); } catch { /* skip */ }
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const alert = await prisma.petAlert.create({
        data: {
            type: type.toUpperCase(),
            species: (['DOG', 'CAT', 'OTHER'].includes(normalizedSpecies) ? normalizedSpecies : 'OTHER') as any,
            breed: breed?.trim() || null,
            name: name?.trim() || null,
            description: description?.trim() || null,
            photoUrl: photoUrl?.trim() || null,
            photoEmbedding: embedding ?? [],
            embeddingModel: embedding ? 'resnet50-imagenet-v1' : null,
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
            locationText: location?.text?.trim() || null,
            radiusMiles: radiusMiles ?? 25,
            contactEmail: contact.email.trim(),
            contactPhone: contact.phone?.trim() || null,
            contactName: contact.name?.trim() || null,
            expiresAt,
        },
    });

    let initialMatches: any[] = [];
    if (embedding) {
        try {
            initialMatches = await searchSimilar(embedding, {
                species: normalizedSpecies,
                limit: 5,
                threshold: 0.75,
            });
        } catch { /* non-fatal */ }
    }

    const { contactEmail, contactPhone, ...safeAlert } = alert;
    return NextResponse.json({ alert: safeAlert, initialMatches }, { status: 201 });
}
