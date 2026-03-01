/**
 * Run Insurer — Breed Health Cost/Condition Enrichment
 *
 * Uses Gemini to generate insurance-grade breed health data
 * based on publicly available Nationwide and Trupanion reports.
 *
 * This replaces direct scraping (which is blocked by Cloudflare).
 *
 * Usage:
 *   npx tsx scraper/run-insurer.ts              # full run
 *   npx tsx scraper/run-insurer.ts --dry-run     # preview only
 *   npx tsx scraper/run-insurer.ts --breed "Golden Retriever"
 *   npx tsx scraper/run-insurer.ts --limit 10
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { createInsurerExtractor } from './adapters/insurer-extractor';

const DELAY_MS = 1000; // Rate limit between Gemini calls

// ── CLI Args ──

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function getArgValue(flag: string): string | null {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const breedFilter = getArgValue('--breed');
const limitStr = getArgValue('--limit');
const limit = limitStr ? parseInt(limitStr, 10) : undefined;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean breed name: strip "Dog Breed Information" etc. suffixes
 */
function cleanBreedName(name: string): string {
    return name
        .replace(/\s*(Dog|Cat)\s*Breed\s*Information\s*/gi, '')
        .replace(/\s*(Dog|Cat)\s*Breed\s*/gi, '')
        .trim();
}

// ── Main ──

async function main() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY required. Set it in .env');
        process.exit(1);
    }

    console.log(`🏥 Golden Years Club — Insurer Breed Health Enrichment${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: Gemini extraction (Nationwide HealthZone + Trupanion data)`);
    console.log(`   Model: gemini-2.5-flash\n`);

    const prisma = await createPrismaClient();
    const extractor = createInsurerExtractor(apiKey);

    // ── Load breeds ──
    const where: Record<string, any> = {};
    if (breedFilter) {
        where.name = { contains: breedFilter, mode: 'insensitive' };
    }

    let breeds = await prisma.breedProfile.findMany({
        where,
        select: {
            id: true,
            name: true,
            species: true,
            insurerLastEnriched: true,
        },
        orderBy: { name: 'asc' },
    });

    // Filter out recently enriched (last 30 days) unless specific breed requested
    if (!breedFilter) {
        breeds = breeds.filter((b: any) => {
            if (!b.insurerLastEnriched) return true;
            const daysSince = (Date.now() - new Date(b.insurerLastEnriched).getTime()) / (1000 * 60 * 60 * 24);
            return daysSince >= 30;
        });
    }

    if (limit) breeds = breeds.slice(0, limit);

    const CONCURRENCY = parseInt(getArgValue('--concurrency') ?? '5', 10);

    console.log(`   📋 ${breeds.length} breeds to process (concurrency: ${CONCURRENCY})${breedFilter ? ` (filter: "${breedFilter}")` : ''}\n`);

    let enriched = 0;
    let errors = 0;
    let completed = 0;

    // ── Concurrent processing with semaphore ──
    async function processBreed(breed: any, idx: number) {
        const cleanName = cleanBreedName(breed.name);
        const progress = `[${idx + 1}/${breeds.length}]`;

        try {
            const data = await extractor.extractInsurerData(cleanName, breed.species);

            const nwCount = data.nationwideConditions.length;
            const trCount = data.trupanionConditions.length;

            if (dryRun) {
                console.log(`   ${progress} 🔍 ${cleanName} (${breed.species}) — NW:${nwCount} TR:${trCount} ($${data.estimatedAnnualCostLow}-$${data.estimatedAnnualCostHigh}/yr)`);
                enriched++;
            } else {
                await prisma.breedProfile.update({
                    where: { id: breed.id },
                    data: {
                        nationwideConditions: data.nationwideConditions as any,
                        trupanionConditions: data.trupanionConditions as any,
                        insurerLastEnriched: new Date(),
                    },
                });
                console.log(`   ${progress} ✅ ${cleanName} — NW:${nwCount} TR:${trCount} ($${data.estimatedAnnualCostLow}-$${data.estimatedAnnualCostHigh}/yr)`);
                enriched++;
            }
        } catch (err) {
            console.error(`   ${progress} ❌ ${cleanName}: ${(err as Error).message?.substring(0, 100)}`);
            errors++;
        }
        completed++;
    }

    // Semaphore-bounded concurrency
    const inFlight = new Set<Promise<void>>();
    for (let i = 0; i < breeds.length; i++) {
        const p = processBreed(breeds[i], i).finally(() => inFlight.delete(p));
        inFlight.add(p);
        if (inFlight.size >= CONCURRENCY) {
            await Promise.race(inFlight);
        }
    }
    await Promise.all(inFlight);

    console.log(`\n🏁 Insurer enrichment complete`);
    console.log(`   ✅ ${enriched} breeds enriched with insurance health data`);
    if (errors > 0) console.log(`   ❌ ${errors} errors`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
