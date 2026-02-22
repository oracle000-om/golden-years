/**
 * Run Open Data — Shelter Outcome Stats from Socrata SODA
 *
 * Fetches euthanasia + intake data from city open data portals.
 * Updates shelter stats with actual outcome data.
 *
 * Usage:
 *   npx tsx scraper/run-opendata.ts              # full run
 *   npx tsx scraper/run-opendata.ts --dry-run     # preview only
 *   npx tsx scraper/run-opendata.ts --days 30     # change lookback period
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { scrapeOpenData } from './adapters/opendata-outcomes';

async function createPrisma() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL required. Set it in .env');
    const pool = new pg.Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (PrismaClient as any)({ adapter }) as PrismaClient;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const daysIdx = process.argv.indexOf('--days');
    const daysPast = daysIdx !== -1 ? parseInt(process.argv[daysIdx + 1], 10) : 90;

    console.log(`📊 Golden Years Club — Open Data Shelter Outcomes${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Looking back ${daysPast} days`);
    console.log('   Config: scraper/config/opendata-config.json\n');

    // ── Step 1: Fetch from all configured cities ──
    const { euthanasiaOutcomes, shelterStats } = await scrapeOpenData({ daysPast });

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📈 Shelter Stats Summary`);
    console.log(`═══════════════════════════════════════════`);

    for (const stats of shelterStats) {
        console.log(`\n   🏠 ${stats.shelterName} (${stats.city}, ${stats.state})`);
        console.log(`      Outcomes: ${stats.totalOutcomes} total`);
        console.log(`      Euthanasia: ${stats.totalEuthanasia}`);
        if (stats.totalIntakes > 0) {
            console.log(`      Intakes: ${stats.totalIntakes}`);
        }
        if (stats.liveReleaseRate != null) {
            const emoji = stats.liveReleaseRate >= 90 ? '🟢' : stats.liveReleaseRate >= 70 ? '🟡' : '🔴';
            console.log(`      Live Release Rate: ${emoji} ${stats.liveReleaseRate}%`);
        }
    }

    console.log(`\n   Total euthanasia outcomes: ${euthanasiaOutcomes.length}`);

    // ── Show euthanasia breakdown by species ──
    const dogs = euthanasiaOutcomes.filter(a => a.species === 'DOG');
    const cats = euthanasiaOutcomes.filter(a => a.species === 'CAT');
    const other = euthanasiaOutcomes.filter(a => a.species === 'OTHER');
    console.log(`      Dogs: ${dogs.length} | Cats: ${cats.length} | Other: ${other.length}`);

    if (dryRun) {
        console.log(`\n--- Recent Euthanasia Outcomes (first 20) ---`);
        for (const a of euthanasiaOutcomes.slice(0, 20)) {
            const ageStr = a.ageKnownYears != null ? `${a.ageKnownYears}y` : '??';
            const dateStr = a.euthScheduledAt
                ? a.euthScheduledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Unknown';
            console.log(`   🔴 ${a.intakeId} | ${a.name || 'Unnamed'} | ${a.species} | ${a.breed || '?'} | ${ageStr} | ${dateStr} | ${a._shelterName}`);
            if (a.notes) console.log(`      ${a.notes}`);
        }
        console.log(`\n✅ Dry run complete.`);
        process.exit(0);
    }

    // ── Step 2: Update shelter stats in DB ──
    const prisma = await createPrisma();

    for (const stats of shelterStats) {
        try {
            // Annualize the stats (if period < 365 days)
            const annualFactor = 365 / stats.periodDays;
            const annualIntake = stats.totalIntakes > 0
                ? Math.round(stats.totalIntakes * annualFactor)
                : Math.round(stats.totalOutcomes * annualFactor);
            const annualEuth = Math.round(stats.totalEuthanasia * annualFactor);

            await (prisma as any).shelter.upsert({
                where: { id: stats.shelterId },
                update: {
                    totalIntakeAnnual: annualIntake,
                    totalEuthanizedAnnual: annualEuth,
                    dataYear: new Date().getFullYear(),
                    dataSourceName: 'Socrata Open Data (SODA)',
                    dataSourceUrl: `https://${stats.shelterId.replace('opendata-', '')}.gov`,
                    lastScrapedAt: new Date(),
                },
                create: {
                    id: stats.shelterId,
                    name: stats.shelterName,
                    county: stats.city,
                    state: stats.state,
                    totalIntakeAnnual: annualIntake,
                    totalEuthanizedAnnual: annualEuth,
                    dataYear: new Date().getFullYear(),
                    dataSourceName: 'Socrata Open Data (SODA)',
                },
            });
            console.log(`   ✅ ${stats.shelterName}: intake=${annualIntake}/yr, euth=${annualEuth}/yr`);
        } catch (err) {
            console.error(`   ❌ ${stats.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    console.log(`\n🏁 Done! Updated ${shelterStats.length} shelter stats from open data.`);
    process.exit(0);
}

main();
