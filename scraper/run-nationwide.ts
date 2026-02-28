/**
 * Run Nationwide — Pet HealthZone Breed Data Scraper
 *
 * Scrapes Nationwide Pet Insurance's HealthZone breed profiles
 * for health conditions, costs, and prevention tips.
 *
 * Requires Playwright browser (Cloudflare protected).
 *
 * Usage:
 *   npx tsx scraper/run-nationwide.ts              # full run
 *   npx tsx scraper/run-nationwide.ts --dry-run     # preview only
 *   npx tsx scraper/run-nationwide.ts --breed "Golden Retriever"
 *   npx tsx scraper/run-nationwide.ts --limit 10
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';
import { scrapeNationwideBreeds } from './adapters/nationwide-healthzone';

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
    console.log(`🏥 Golden Years Club — Nationwide Pet HealthZone Scraper${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: petinsurance.com/pet-breeds/\n`);

    const prisma = await createPrismaClient();

    // ── Load breeds ──
    const where: Record<string, any> = {};
    if (breedFilter) {
        where.name = { contains: breedFilter, mode: 'insensitive' };
    }

    let breeds = await (prisma as any).breedProfile.findMany({
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

    const results = await scrapeNationwideBreeds(
        cleanedBreeds.map((b: any) => ({ name: b.cleanName, species: b.species })),
        (breed, idx, total, result) => {
            const progress = `[${idx + 1}/${total}]`;
            if (result) {
                console.log(`   ${progress} ✅ ${breed} — ${result.conditions.length} conditions found`);
                if (dryRun && result.conditions.length > 0) {
                    for (const c of result.conditions.slice(0, 3)) {
                        console.log(`      • ${c.condition}${c.costRange ? ` (${c.costRange})` : ''}`);
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
            // Find the original breed record by cleaned name
            const breed = cleanedBreeds.find((b: any) => b.cleanName === result.breed);
            if (!breed) continue;

            try {
                await (prisma as any).breedProfile.update({
                    where: { id: breed.id },
                    data: {
                        nationwideConditions: result.conditions,
                        insurerLastEnriched: new Date(),
                    },
                });
                updated++;
            } catch (err) {
                console.error(`   ❌ ${breed.name}: ${(err as Error).message?.substring(0, 80)}`);
            }
        }
        console.log(`\n   ✅ ${updated} breeds updated with Nationwide data`);
    }

    console.log(`\n🏁 Nationwide scraper complete`);
    console.log(`   ✅ ${results.length} breeds with condition data`);
    console.log(`   ⚪ ${breeds.length - results.length} breeds with no page found`);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
