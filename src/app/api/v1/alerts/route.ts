/**
 * POST /api/v1/alerts — Create a Lost Pet Alert
 *
 * Accepts both:
 *   - multipart/form-data: { image, email, pet_name, species }  (Sniff)
 *   - application/json:    { species, photoUrl, contact, ... }   (API)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { getEmbedding, getEmbeddingFromBytes } from '@/lib/embedding-singleton';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter('v1-alerts-create', 5);

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

/** Handle Sniff-style FormData alerts */
async function handleFormData(request: NextRequest) {
    const formData = await request.formData();

    const file = formData.get('image') as File | null;
    const email = (formData.get('email') as string) || '';
    const petName = (formData.get('pet_name') as string) || 'My Pet';
    const species = ((formData.get('species') as string) || 'unknown').toUpperCase();

    if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    let embedding: number[] | null = null;
    if (file && file.size > 0 && file.size < 10 * 1024 * 1024) {
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        embedding = await getEmbeddingFromBytes(base64);
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const alert = await (prisma as any).petAlert.create({
        data: {
            type: 'LOST',
            species: ['DOG', 'CAT', 'OTHER'].includes(species) ? species : 'OTHER',
            name: petName.trim() || null,
            photoEmbedding: embedding ?? [],
            embeddingModel: embedding ? 'resnet50-imagenet-v1' : null,
            contactEmail: email.trim(),
            expiresAt,
        },
    });

    return NextResponse.json({
        status: 'success',
        alert_id: alert.id,
        expires_at: alert.expiresAt,
    }, { status: 201 });
}

/** Handle JSON API alerts */
async function handleJson(request: NextRequest) {
    let body: any;
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { species, breed, name, photoUrl, description, location, contact, radiusMiles } = body;

    if (!contact?.email) {
        return NextResponse.json({ error: 'contact.email is required' }, { status: 400 });
    }

    const normalizedSpecies = (species ?? 'DOG').toUpperCase();

    let embedding: number[] | null = null;
    if (photoUrl && typeof photoUrl === 'string') {
        try { new URL(photoUrl); embedding = await getEmbedding(photoUrl); } catch { /* skip */ }
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const alert = await (prisma as any).petAlert.create({
        data: {
            type: 'LOST',
            species: ['DOG', 'CAT', 'OTHER'].includes(normalizedSpecies) ? normalizedSpecies : 'OTHER',
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

    return NextResponse.json({
        alertId: alert.id,
        status: alert.status,
        expiresAt: alert.expiresAt,
    }, { status: 201 });
}
