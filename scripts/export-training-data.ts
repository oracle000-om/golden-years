/**
 * Export Training Data — JSONL Exporter
 *
 * Exports labeled CV assessment data from AnimalSnapshot records
 * for fine-tuning a self-hosted vision model.
 *
 * Each JSONL line contains:
 *   - photoUrl: URL to the animal's photo
 *   - photoUrls: additional photo URLs
 *   - assessment: the full AnimalAssessment JSON (labels)
 *   - modelUsed: which Gemini model produced the assessment
 *   - scrapedAt: timestamp of assessment
 *
 * Usage:
 *   npx tsx scripts/export-training-data.ts --count
 *   npx tsx scripts/export-training-data.ts --output training-data.jsonl
 *   npx tsx scripts/export-training-data.ts --min-confidence HIGH --output high-quality.jsonl
 */

import 'dotenv/config';
import * as fs from 'fs';
import { createPrismaClient } from '../scraper/lib/prisma';

interface RawAssessment {
    assessment?: Record<string, unknown>;
    diff?: unknown;
}

async function main() {
    const args = process.argv.slice(2);
    const countOnly = args.includes('--count');
    const outputArg = args.find(a => a.startsWith('--output='))?.split('=')[1];
    const minConfidenceArg = args.find(a => a.startsWith('--min-confidence='))?.split('=')[1]?.toUpperCase();

    const prisma = createPrismaClient();

    try {
        // Query snapshots with rawAssessment data
        const snapshots = await (prisma as any).animalSnapshot.findMany({
            where: {
                rawAssessment: { not: null },
            },
            select: {
                id: true,
                animalId: true,
                scrapedAt: true,
                rawAssessment: true,
                animal: {
                    select: {
                        photoUrl: true,
                        photoUrls: true,
                        species: true,
                        breed: true,
                    },
                },
            },
            orderBy: { scrapedAt: 'desc' },
        });

        // Filter and transform
        const validExamples: Array<{
            photoUrl: string;
            photoUrls: string[];
            species: string;
            breed: string | null;
            assessment: Record<string, unknown>;
            modelUsed: string;
            confidence: string;
            scrapedAt: string;
        }> = [];

        for (const snap of snapshots) {
            const raw = snap.rawAssessment as RawAssessment | null;
            if (!raw?.assessment) continue;

            const assessment = raw.assessment;
            const confidence = (assessment.confidence as string) || 'NONE';
            const modelUsed = (assessment.modelUsed as string) || 'unknown';

            // Apply confidence filter
            if (minConfidenceArg) {
                const rankMap: Record<string, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
                const minRank = rankMap[minConfidenceArg] || 0;
                const thisRank = rankMap[confidence] || 0;
                if (thisRank < minRank) continue;
            }

            // Skip if no photo
            if (!snap.animal?.photoUrl) continue;

            validExamples.push({
                photoUrl: snap.animal.photoUrl,
                photoUrls: snap.animal.photoUrls || [],
                species: snap.animal.species,
                breed: snap.animal.breed,
                assessment,
                modelUsed,
                confidence,
                scrapedAt: snap.scrapedAt.toISOString(),
            });
        }

        // Count mode
        if (countOnly) {
            const byConfidence: Record<string, number> = {};
            const byModel: Record<string, number> = {};
            const bySpecies: Record<string, number> = {};

            for (const ex of validExamples) {
                byConfidence[ex.confidence] = (byConfidence[ex.confidence] || 0) + 1;
                byModel[ex.modelUsed] = (byModel[ex.modelUsed] || 0) + 1;
                bySpecies[ex.species] = (bySpecies[ex.species] || 0) + 1;
            }

            console.log('\n📊 Training Data Summary\n');
            console.log(`Total examples: ${validExamples.length}`);
            console.log('\nBy confidence:');
            for (const [k, v] of Object.entries(byConfidence).sort((a, b) => b[1] - a[1])) {
                console.log(`  ${k}: ${v}`);
            }
            console.log('\nBy model:');
            for (const [k, v] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
                console.log(`  ${k}: ${v}`);
            }
            console.log('\nBy species:');
            for (const [k, v] of Object.entries(bySpecies).sort((a, b) => b[1] - a[1])) {
                console.log(`  ${k}: ${v}`);
            }

            const highCount = byConfidence['HIGH'] || 0;
            const readiness = highCount >= 2000 ? '✅ READY' : highCount >= 500 ? '⚠ APPROACHING' : '❌ NOT YET';
            console.log(`\nFine-tuning readiness: ${readiness} (need 2,000+ HIGH, have ${highCount})`);
            return;
        }

        // Export mode
        const outputPath = outputArg || 'training-data.jsonl';
        const stream = fs.createWriteStream(outputPath);

        for (const ex of validExamples) {
            stream.write(JSON.stringify(ex) + '\n');
        }

        stream.end();
        console.log(`✅ Exported ${validExamples.length} examples to ${outputPath}`);

    } finally {
        await (prisma as any).$disconnect();
    }
}

main().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
});
