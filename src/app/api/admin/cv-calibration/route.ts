/**
 * CV Calibration — Admin API
 *
 * Returns aggregate confidence metrics for monitoring
 * CV pipeline quality. No auth required for admin routes
 * (behind admin layout).
 *
 * GET /api/admin/cv-calibration
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        // 1. Confidence distribution
        const confidenceCounts = await prisma.animal.groupBy({
            by: ['ageConfidence'],
            _count: { id: true },
            where: { ageSource: 'CV_ESTIMATED' },
        });

        const confidenceDistribution: Record<string, number> = {};
        for (const row of confidenceCounts) {
            confidenceDistribution[row.ageConfidence || 'NONE'] = row._count.id;
        }

        // 2. Average age range span by confidence
        const cvAnimals = await prisma.animal.findMany({
            where: {
                ageSource: 'CV_ESTIMATED',
                ageEstimatedLow: { not: null },
                ageEstimatedHigh: { not: null },
            },
            select: {
                ageConfidence: true,
                ageEstimatedLow: true,
                ageEstimatedHigh: true,
            },
        });

        const spanByConfidence: Record<string, { sum: number; count: number }> = {};
        for (const a of cvAnimals) {
            const conf = a.ageConfidence || 'NONE';
            if (!spanByConfidence[conf]) spanByConfidence[conf] = { sum: 0, count: 0 };
            spanByConfidence[conf].sum += (a.ageEstimatedHigh! - a.ageEstimatedLow!);
            spanByConfidence[conf].count += 1;
        }

        const avgSpanByConfidence: Record<string, number> = {};
        for (const [conf, data] of Object.entries(spanByConfidence)) {
            avgSpanByConfidence[conf] = Math.round((data.sum / data.count) * 10) / 10;
        }

        // 3. Data conflict rate (from Batch 1)
        const totalCvAnimals = cvAnimals.length;
        const withConflicts = await prisma.animal.count({
            where: {
                ageSource: 'CV_ESTIMATED',
                dataConflicts: { isEmpty: false },
            },
        });

        // 4. Photo quality distribution
        const qualityCounts = await prisma.animal.groupBy({
            by: ['photoQuality'],
            _count: { id: true },
            where: { ageSource: 'CV_ESTIMATED' },
        });

        const photoQualityDistribution: Record<string, number> = {};
        for (const row of qualityCounts) {
            photoQualityDistribution[row.photoQuality || 'unknown'] = row._count.id;
        }

        // 5. Confidence × photo quality cross-tab
        const crossTab: Record<string, Record<string, number>> = {};
        const crossData = await prisma.animal.findMany({
            where: { ageSource: 'CV_ESTIMATED' },
            select: { ageConfidence: true, photoQuality: true },
        });
        for (const row of crossData) {
            const conf = row.ageConfidence || 'NONE';
            const qual = row.photoQuality || 'unknown';
            if (!crossTab[conf]) crossTab[conf] = {};
            crossTab[conf][qual] = (crossTab[conf][qual] || 0) + 1;
        }

        return NextResponse.json({
            totalCvAssessments: totalCvAnimals,
            confidenceDistribution,
            avgSpanByConfidence,
            conflictRate: totalCvAnimals > 0
                ? Math.round((withConflicts / totalCvAnimals) * 1000) / 10
                : 0,
            conflictsFound: withConflicts,
            photoQualityDistribution,
            confidenceByPhotoQuality: crossTab,
        });
    } catch (error) {
        console.error('CV calibration API error:', error);
        return NextResponse.json(
            { error: 'Failed to compute calibration metrics' },
            { status: 500 },
        );
    }
}
