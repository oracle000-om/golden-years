/**
 * Run Trupanion — Breed Conditions Scraper
 *
 * Scrapes Trupanion's breed pages for health conditions,
 * average costs, claim frequency, and life-stage data.
 *
 * Requires Playwright browser (bot protected).
 *
 * Usage:
 *   npx tsx scraper/run-trupanion.ts              # full run
 *   npx tsx scraper/run-trupanion.ts --dry-run     # preview only
 *   npx tsx scraper/run-trupanion.ts --breed "Golden Retriever"
 *   npx tsx scraper/run-trupanion.ts --limit 10
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { scrapeTrupanionBreeds } from './adapters/trupanion';

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

// ── Main ──

async function main() {
    console.log(`🐾 Golden Years Club — Trupanion Breed Conditions Scraper${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: trupanion.com/breeds/\n`);

    const prisma = await createPrismaClient();

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

    console.log(`   📋 ${breeds.length} breeds to process${breedFilter ? ` (filter: "${breedFilter}")` : ''}\n`);

    // Clean breed names (remove "Dog Breed Information" etc.)
    const cleanedBreeds = breeds.map((b: any) => ({
        ...b,
        cleanName: b.name
            .replace(/\s*(Dog|Cat)\s*Breed\s*Information\s*/gi, '')
            .replace(/\s*(Dog|Cat)\s*Breed\s*/gi, '')
            .trim(),
    }));

    const results = await scrapeTrupanionBreeds(
        cleanedBreeds.map((b: any) => ({ name: b.cleanName, species: b.species })),
        (breed, idx, total, result) => {
            const progress = `[${idx + 1}/${total}]`;
            if (result) {
                console.log(`   ${progress} ✅ ${breed} — ${result.conditions.length} conditions found`);
                if (dryRun && result.conditions.length > 0) {
                    for (const c of result.conditions.slice(0, 3)) {
                        const parts = [c.condition];
                        if (c.costRange) parts.push(c.costRange);
                        if (c.lifeStage) parts.push(`[${c.lifeStage}]`);
                        console.log(`      • ${parts.join(' · ')}`);
                    }
                }
            } else {
                console.log(`   ${progress} ⚪ ${breed} — no page found`);
            }
        },
    );

    if (!dryRun) {
        let updated = 0;
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const breed = cleanedBreeds.find((b: any) => b.cleanName === result.breed);
            if (!breed) continue;

            try {
                await prisma.breedProfile.update({
                    where: { id: breed.id },
                    data: {
                        trupanionConditions: result.conditions as any,
                        insurerLastEnriched: new Date(),
                    },
                });
                updated++;
            } catch (err) {
                console.error(`   ❌ ${breed.name}: ${(err as Error).message?.substring(0, 80)}`);
            }
        }
        console.log(`\n   ✅ ${updated} breeds updated with Trupanion data`);
    }

    console.log(`\n🏁 Trupanion scraper complete`);
    console.log(`   ✅ ${results.length} breeds with condition data`);
    console.log(`   ⚪ ${breeds.length - results.length} breeds with no page found`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
