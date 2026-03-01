/**
 * POST /api/v1/match — Visual Pet Matching
 *
 * Upload a photo file OR provide a photo URL to find visually similar animals.
 * Supports both:
 *   - multipart/form-data: { image: File }         (Sniff frontend)
 *   - application/json:    { photoUrl: string }     (API consumers)
 *
 * Response: { matches: [...], meta: { embedMs, searchMs, totalMs, model } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/api-auth';
import { getEmbedding, getEmbeddingFromBytes, searchSimilar } from '@/lib/embedding-singleton';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter('v1-match', 20);

/**
 * Extract an embedding from either FormData (file) or JSON (photoUrl).
 * Returns [embedding, error] tuple.
 */
async function extractEmbedding(request: NextRequest): Promise<[number[] | null, string | null]> {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        // File upload (Sniff frontend sends FormData with 'image' field)
        const formData = await request.formData();
        const file = formData.get('image') as File | null;
        if (!file || file.size === 0) {
            return [null, 'image file is required'];
        }
        if (file.size > 10 * 1024 * 1024) {
            return [null, 'File too large (max 10MB)'];
        }
        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        const embedding = await getEmbeddingFromBytes(base64);
        return [embedding, embedding ? null : 'Failed to generate embedding from uploaded image'];
    } else {
        // JSON body (API consumers)
        let body: any;
        try {
            body = await request.json();
        } catch {
            return [null, 'Invalid JSON body'];
        }
        const { photoUrl } = body;
        if (!photoUrl || typeof photoUrl !== 'string') {
            return [null, 'photoUrl is required'];
        }
        try { new URL(photoUrl); } catch { return [null, 'photoUrl must be a valid URL']; }
        const embedding = await getEmbedding(photoUrl);
        return [embedding, embedding ? null : 'Failed to generate embedding'];
    }
}

export async function POST(request: NextRequest) {
    // ── Auth ──
    const auth = await validateApiAuth(request);
    if (!auth.authenticated) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // ── Rate limit ──
    const ip = getClientIp(request);
    const limit = await limiter.check(ip);
    if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // ── Generate embedding (from file or URL) ──
    const startTime = Date.now();
    const [embedding, error] = await extractEmbedding(request);
    if (!embedding) {
        return NextResponse.json({ error }, { status: 422 });
    }
    const embedMs = Date.now() - startTime;

    // ── Search Zilliz via Python worker ──
    const searchStart = Date.now();
    const contentType = request.headers.get('content-type') || '';
    let species: string | undefined;
    let topK = 10;
    let threshold = 0.70;

    if (!contentType.includes('multipart/form-data')) {
        // JSON body was already parsed; re-parse for search opts
        // (embedding was extracted but other fields were not saved)
        // For FormData, we don't have species filter
    }

    const matches = await searchSimilar(embedding, {
        species,
        limit: Math.min(topK, 50),
        threshold,
    });
    const searchMs = Date.now() - searchStart;

    if (matches.length === 0) {
        return NextResponse.json({
            status: 'success',
            matches: [],
            meta: { embedMs, searchMs, model: 'resnet50-imagenet-v1' },
        });
    }

    // ── Hydrate from Postgres ──
    const animalIds = matches.map(m => m.id);
    const animals = await prisma.animal.findMany({
        where: { id: { in: animalIds } },
        select: {
            id: true,
            name: true,
            breed: true,
            species: true,
            photoUrl: true,
            photoUrls: true,
            status: true,
            sex: true,
            assessment: {
                select: { ageEstimatedLow: true, ageEstimatedHigh: true },
            },
            shelter: {
                select: { id: true, name: true, state: true, county: true },
            },
        },
    });

    const animalMap = new Map(animals.map((a: any) => [a.id, a]));
    const hydrated = matches
        .map(m => {
            const animal: any = animalMap.get(m.id);
            if (!animal) return null;
            return {
                ...animal,
                similarity: m.similarity,
                // Sniff-compat fields
                pet_id: animal.id,
                pet_name: animal.name || 'Unknown',
                similarity_score: m.similarity,
            };
        })
        .filter(Boolean);

    return NextResponse.json({
        status: 'success',
        matches: hydrated,
        meta: {
            total: hydrated.length,
            embedMs,
            searchMs,
            totalMs: Date.now() - startTime,
            model: 'resnet50-imagenet-v1',
        },
    });
}
