/**
 * CV Calibration — Admin API
 *
 * Returns aggregate confidence metrics and actionable tuning
 * suggestions for monitoring CV pipeline quality.
 *
 * GET /api/admin/cv-calibration
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '../../../../generated/prisma/client';

export async function GET() {
    try {
        // 1. Confidence distribution
        const confidenceCounts = await (prisma as any).animalAssessment.groupBy({
            by: ['ageConfidence'],
            _count: { id: true },
        });

        const confidenceDistribution: Record<string, number> = {};
        for (const row of confidenceCounts) {
            confidenceDistribution[row.ageConfidence || 'NONE'] = row._count.id;
        }

        // 2. Average age range span by confidence
        const cvAnimals = await (prisma as any).animalAssessment.findMany({
            where: {
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

        // 3. Data conflict rate
        const totalCvAnimals = cvAnimals.length;
        const withConflicts = await (prisma as any).animalAssessment.count({
            where: {
                dataConflicts: { isEmpty: false },
            },
        });

        // 4. Photo quality distribution
        const qualityCounts = await (prisma as any).animalAssessment.groupBy({
            by: ['photoQuality'],
            _count: { id: true },
        });

        const photoQualityDistribution: Record<string, number> = {};
        for (const row of qualityCounts) {
            photoQualityDistribution[row.photoQuality || 'unknown'] = row._count.id;
        }

        // 5. Confidence × photo quality cross-tab
        const crossTab: Record<string, Record<string, number>> = {};
        const crossData = await (prisma as any).animalAssessment.findMany({
            select: { ageConfidence: true, photoQuality: true },
        });
        for (const row of crossData) {
            const conf = row.ageConfidence || 'NONE';
            const qual = row.photoQuality || 'unknown';
            if (!crossTab[conf]) crossTab[conf] = {};
            crossTab[conf][qual] = (crossTab[conf][qual] || 0) + 1;
        }

        // 6. Model distribution from rawAssessment snapshots
        const modelDistribution: Record<string, number> = {};
        const recentSnapshots = await prisma.animalSnapshot.findMany({
            where: { rawAssessment: { not: Prisma.JsonNull } },
            select: { rawAssessment: true },
            take: 500,
            orderBy: { scrapedAt: 'desc' },
        });
        for (const snap of recentSnapshots) {
            const raw = snap.rawAssessment as Record<string, unknown> | null;
            const assessment = raw?.assessment as Record<string, unknown> | null;
            const model = (assessment?.modelUsed as string) || 'unknown';
            modelDistribution[model] = (modelDistribution[model] || 0) + 1;
        }

        // 7. Compute actionable calibration suggestions
        const conflictRate = totalCvAnimals > 0
            ? Math.round((withConflicts / totalCvAnimals) * 1000) / 10
            : 0;

        const suggestions: string[] = [];
        const promptParts: string[] = [];
        let suggestedMinConfidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        let rejectPoorPhotos = false;

        if (totalCvAnimals > 0) {
            // If >60% HIGH confidence, raise floor to MEDIUM
            const highCount = confidenceDistribution['HIGH'] || 0;
            const highPct = (highCount / totalCvAnimals) * 100;
            if (highPct > 60) {
                suggestedMinConfidence = 'MEDIUM';
                suggestions.push(`${highPct.toFixed(0)}% HIGH confidence — raising minimum to MEDIUM`);
            }

            // If MEDIUM avg span >5yr, add precision prompt
            const mediumSpan = avgSpanByConfidence['MEDIUM'] || 0;
            if (mediumSpan > 5) {
                promptParts.push('Narrow age estimates to within 3 years when possible.');
                suggestions.push(`MEDIUM confidence avg span is ${mediumSpan.toFixed(1)}yr — adding precision prompt`);
            }

            // If >40% poor photos, flag for rejection
            const poorCount = photoQualityDistribution['poor'] || 0;
            const poorPct = (poorCount / totalCvAnimals) * 100;
            if (poorPct > 40) {
                rejectPoorPhotos = true;
                suggestions.push(`${poorPct.toFixed(0)}% poor-quality photos — enabling photo rejection`);
            }

            // If conflict rate >20%, emphasize cross-validation
            if (conflictRate > 20) {
                promptParts.push('Pay extra attention to cross-validation and report all discrepancies.');
                suggestions.push(`Conflict rate is ${conflictRate.toFixed(1)}% — adding cross-validation emphasis`);
            }

            if (suggestions.length === 0) {
                suggestions.push('Pipeline metrics within normal range — no adjustments needed');
            }
        } else {
            suggestions.push('No CV data yet — using defaults');
        }

        return NextResponse.json({
            totalCvAssessments: totalCvAnimals,
            confidenceDistribution,
            avgSpanByConfidence,
            conflictRate,
            conflictsFound: withConflicts,
            photoQualityDistribution,
            confidenceByPhotoQuality: crossTab,
            modelDistribution,
            calibration: {
                suggestedMinConfidence,
                promptAddendum: promptParts.length > 0 ? promptParts.join(' ') : null,
                rejectPoorPhotos,
                suggestions,
            },
        });
    } catch (error) {
        console.error('CV calibration API error:', error);
        return NextResponse.json(
            { error: 'Failed to compute calibration metrics' },
            { status: 500 },
        );
    }
}

