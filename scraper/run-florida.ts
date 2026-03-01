/**
 * Run Florida — UF Shelter Medicine Census Import
 *
 * Scrapes and imports shelter statistics from the University of Florida's
 * Shelter Medicine Program's Florida Animal Shelter Census.
 * All 153 known Florida shelters participate.
 *
 * Data source: https://sheltermedicine.vetmed.ufl.edu/.../shelter-level-data/
 *
 * Usage:
 *   npx tsx scraper/run-florida.ts              # full run
 *   npx tsx scraper/run-florida.ts --dry-run     # preview only
 *   npx tsx scraper/run-florida.ts --min-intake 100
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

const DATA_URL = 'https://sheltermedicine.vetmed.ufl.edu/research/current-studies/florida-animal-sheltering/shelter-level-data/';

interface FloridaShelter {
    name: string;
    county: string;
    ruralUrban: string;
    shelterType: string;
    totalLiveOutcomes: number;
    totalNonLiveOutcomes: number;
    totalIntake: number;
    dogEuth: number;
    catEuth: number;
    totalEuth: number;
    dogAdopt: number;
    catAdopt: number;
    totalAdopt: number;
    liveReleaseRate: number;
}

function parseNum(s: string): number {
    if (!s || s === 'NA' || s === '&lt;1' || s === '<1') return 0;
    return parseInt(s.replace(/,/g, ''), 10) || 0;
}

async function fetchFloridaData(): Promise<FloridaShelter[]> {
    const resp = await fetch(DATA_URL, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'GoldenYearsClub/1.0 (animal welfare research)' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Find the tablepress table
    const tableMatch = html.match(/<table id="tablepress-10"[\s\S]*?<\/table>/);
    if (!tableMatch) throw new Error('Table not found on page');

    const tableHtml = tableMatch[0];

    // Parse data rows from tbody
    const bodyMatch = tableHtml.match(/<tbody[\s\S]*?>[\s\S]*?<\/tbody>/);
    if (!bodyMatch) throw new Error('No tbody found');

    const shelters: FloridaShelter[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;

    while ((rm = rowRegex.exec(bodyMatch[0])) !== null) {
        const cells: string[] = [];
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cm;
        while ((cm = tdRegex.exec(rm[1])) !== null) {
            cells.push(cm[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim());
        }
        if (cells.length < 40) continue; // Skip malformed rows

        // Column indices (from headers):
        // 0: Shelter, 1: County, 2: Rural/Urban, 3: County Pop, 4: Shelter Type
        // 8-19: Intake columns
        // 20-21: Adoption Dog/Cat
        // 22-23: RTO Dog/Cat
        // 24-27: Transfer Out Dog/Cat, Export Dog/Cat
        // 36-37: Shelter Euth Dog/Cat
        // 38-39: Total Dog/Cat Live Outcomes
        // 40: Total Live Outcomes
        // 41-42: Non-Live Dog/Cat Outcomes
        // 43: Total Non-Live Outcomes

        const name = cells[0];
        const county = cells[1];

        // Sum intake: stray + owner surrender + transfer in + imported + seized + other (dog + cat)
        const dogIntake = parseNum(cells[8]) + parseNum(cells[10]) + parseNum(cells[12]) + parseNum(cells[14]) + parseNum(cells[16]) + parseNum(cells[18]);
        const catIntake = parseNum(cells[9]) + parseNum(cells[11]) + parseNum(cells[13]) + parseNum(cells[15]) + parseNum(cells[17]) + parseNum(cells[19]);
        const totalIntake = dogIntake + catIntake;

        const dogEuth = parseNum(cells[36]);
        const catEuth = parseNum(cells[37]);
        const totalEuth = dogEuth + catEuth;

        const dogAdopt = parseNum(cells[20]);
        const catAdopt = parseNum(cells[21]);

        const totalLiveOutcomes = parseNum(cells[40]);
        const totalNonLiveOutcomes = parseNum(cells[43]);

        const liveReleaseRate = totalIntake > 0
            ? Math.round(((totalIntake - totalEuth) / totalIntake) * 100)
            : (totalLiveOutcomes > 0 ? Math.round((totalLiveOutcomes / (totalLiveOutcomes + totalNonLiveOutcomes)) * 100) : 0);

        shelters.push({
            name,
            county,
            ruralUrban: cells[2],
            shelterType: cells[4],
            totalLiveOutcomes,
            totalNonLiveOutcomes,
            totalIntake: totalIntake || (totalLiveOutcomes + totalNonLiveOutcomes),
            dogEuth,
            catEuth,
            totalEuth,
            dogAdopt,
            catAdopt,
            totalAdopt: dogAdopt + catAdopt,
            liveReleaseRate,
        });
    }

    return shelters;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const minIntakeArg = process.argv.find(a => a.startsWith('--min-intake'));
    const minIntake = minIntakeArg
        ? parseInt(process.argv[process.argv.indexOf(minIntakeArg) + 1], 10)
        : 50;

    console.log(`🌴  Golden Years Club — Florida Shelter Stats${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: UF Shelter Medicine Program — Florida Animal Shelter Census`);
    console.log(`   Year: 2024 | Min intake: ${minIntake}\n`);

    console.log('📊 Fetching shelter data...');
    const shelters = await fetchFloridaData();
    console.log(`   Found ${shelters.length} shelters\n`);

    const qualifying = shelters.filter(s => s.totalIntake >= minIntake);
    const noKill = qualifying.filter(s => s.liveReleaseRate >= 90);

    qualifying.sort((a, b) => b.liveReleaseRate - a.liveReleaseRate);

    console.log(`═══════════════════════════════════════════`);
    console.log(`📈 Florida Shelter Statistics — 2024`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Qualifying shelters: ${qualifying.length}`);
    console.log(`   No-kill (≥90% LRR): ${noKill.length}`);
    console.log(`   Below 90%: ${qualifying.length - noKill.length}\n`);

    if (noKill.length > 0) {
        console.log(`   🏆 No-Kill Shelters:`);
        for (const r of noKill.slice(0, 20)) {
            console.log(`      ${r.liveReleaseRate}% | ${r.name} (${r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuth}`);
        }
        if (noKill.length > 20) console.log(`      ... and ${noKill.length - 20} more`);
    }

    const below = qualifying.filter(s => s.liveReleaseRate < 90);
    if (below.length > 0) {
        console.log(`\n   📊 Sample below 90%:`);
        for (const r of below.slice(0, 10)) {
            console.log(`      ${r.liveReleaseRate}% | ${r.name} (${r.county}) — intake: ${r.totalIntake}, euth: ${r.totalEuth}`);
        }
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. ${qualifying.length} shelters ready to import.`);
        process.exit(0);
    }

    // Upsert into DB
    console.log(`\n💾 Writing ${qualifying.length} shelter stats to database...`);
    const prisma = await createPrismaClient();
    let created = 0;
    let updated = 0;

    for (const s of qualifying) {
        const dbId = `fl-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
        try {
            const existing = await prisma.shelter.findUnique({ where: { id: dbId } });

            const data: Record<string, any> = {
                totalIntakeAnnual: s.totalIntake,
                totalEuthanizedAnnual: s.totalEuth,
                dataYear: 2024,
                dataSourceName: 'UF Shelter Medicine Census',
                dataSourceUrl: DATA_URL,
                lastScrapedAt: new Date(),
            };

            await prisma.shelter.upsert({
                where: { id: dbId },
                update: data,
                create: {
                    id: dbId,
                    name: s.name,
                    county: s.county,
                    state: 'FL',
                    shelterType: s.liveReleaseRate >= 90 ? 'NO_KILL' : 'MUNICIPAL',
                    ...data,
                },
            });

            if (existing) updated++;
            else created++;
        } catch (err) {
            console.error(`   ❌ ${s.name}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }

    console.log(`\n🏁 Done!`);
    console.log(`   Created: ${created} | Updated: ${updated}`);
    console.log(`   No-kill shelters: ${noKill.length}`);
    console.log(`   Total with data: ${qualifying.length}`);
    process.exit(0);
}

main();
