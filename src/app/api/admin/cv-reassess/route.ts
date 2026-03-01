/**
 * CV Re-Assessment — Admin API
 *
 * Queues animals for CV re-processing by clearing their age estimates.
 * Next scraper run will pick them up automatically.
 *
 * POST /api/admin/cv-reassess
 *
 * Body: {
 *   confidence?: 'LOW' | 'MEDIUM' | 'HIGH'  — only re-assess this confidence level
 *   shelterId?: string                       — only re-assess this shelter
 *   olderThanDays?: number                   — only re-assess CV older than N days
 *   limit?: number                           — max animals to queue (default 100)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;

        const confidence = typeof body.confidence === 'string' ? body.confidence : undefined;
        const shelterId = typeof body.shelterId === 'string' ? body.shelterId : undefined;
        const olderThanDays = typeof body.olderThanDays === 'number' ? body.olderThanDays : undefined;
        const limit = typeof body.limit === 'number' ? Math.min(body.limit, 500) : 100;

        // Build filter
        const assessmentWhere: Record<string, unknown> = {
            ageEstimatedLow: { not: null },
        };
        if (confidence) {
            assessmentWhere.ageConfidence = confidence;
        }

        const animalWhere: Record<string, unknown> = {
            ageSource: 'CV_ESTIMATED',
            assessment: assessmentWhere,
        };
        if (shelterId) {
            animalWhere.shelterId = shelterId;
        }
        if (olderThanDays) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - olderThanDays);
            animalWhere.updatedAt = { lt: cutoff };
        }

        // Find matching animals
        const animals = await prisma.animal.findMany({
            where: animalWhere as any,
            select: { id: true, name: true, assessment: { select: { id: true, ageConfidence: true } } },
            take: limit,
            orderBy: { updatedAt: 'asc' }, // oldest CV first
        });

        if (animals.length === 0) {
            return NextResponse.json({
                queued: 0,
                message: 'No animals matched the filter criteria',
            });
        }

        const animalIds = animals.map(a => a.id);

        // Clear assessment data so next scraper run re-processes them
        await prisma.animalAssessment.deleteMany({
            where: { animalId: { in: animalIds } },
        });

        // Reset ageSource so next scraper run reprocesses
        const result = await prisma.animal.updateMany({
            where: { id: { in: animalIds } },
            data: {
                ageSource: 'CV_ESTIMATED',
            },
        });

        console.log(`🔄 CV re-assessment queued: ${result.count} animals`);

        return NextResponse.json({
            queued: result.count,
            filter: {
                confidence: confidence || 'any',
                shelterId: shelterId || 'any',
                olderThanDays: olderThanDays || 'any',
            },
            message: `${result.count} animals queued for re-assessment on next scraper run`,
        });
    } catch (error) {
        console.error('CV re-assessment API error:', error);
        return NextResponse.json(
            { error: 'Failed to queue re-assessment' },
            { status: 500 },
        );
    }
}
