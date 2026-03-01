/**
 * Run Pet Store Bans Import
 *
 * Scrapes ASPCA and other sources for municipal/state retail
 * pet sale bans and upserts into the pet_store_bans table.
 *
 * Usage:
 *   npx tsx scraper/run-pet-store-bans.ts              # full import
 *   npx tsx scraper/run-pet-store-bans.ts --dry-run    # preview only
 */

import 'dotenv/config';
import { createPrismaClient } from './lib/prisma';

// Statewide bans — well-documented, manually curated
const STATEWIDE_BANS: Array<{
    state: string;
    effectiveDate: string;
    speciesCovered: string[];
    sourceUrl: string;
}> = [
        { state: 'CA', effectiveDate: '2019-01-01', speciesCovered: ['DOG', 'CAT', 'RABBIT'], sourceUrl: 'https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=201720180AB485' },
        { state: 'MD', effectiveDate: '2020-01-01', speciesCovered: ['DOG', 'CAT'], sourceUrl: 'https://mgaleg.maryland.gov/mgawebsite/Legislation/Details/HB1662?ys=2018RS' },
        { state: 'NY', effectiveDate: '2024-12-15', speciesCovered: ['DOG', 'CAT', 'RABBIT'], sourceUrl: 'https://www.nysenate.gov/legislation/bills/2023/A4283' },
        { state: 'IL', effectiveDate: '2021-01-01', speciesCovered: ['DOG', 'CAT'], sourceUrl: 'https://www.ilga.gov/legislation/BillStatus.asp?DocNum=1711&GAID=15&DocTypeID=SB' },
        { state: 'ME', effectiveDate: '2022-01-01', speciesCovered: ['DOG', 'CAT'], sourceUrl: 'https://legislature.maine.gov/LawMakerWeb/summary.asp?ID=280080670' },
        { state: 'OR', effectiveDate: '2024-01-01', speciesCovered: ['DOG', 'CAT'], sourceUrl: 'https://olis.oregonlegislature.gov/liz/2023R1/Measures/Overview/SB1097' },
        { state: 'WA', effectiveDate: '2023-07-23', speciesCovered: ['DOG', 'CAT'], sourceUrl: 'https://app.leg.wa.gov/billsummary?BillNumber=1424&Year=2023' },
    ];

// Top municipal bans by state (sampled, not exhaustive)
const MUNICIPAL_BANS: Array<{
    state: string;
    municipality: string;
    effectiveDate?: string;
    speciesCovered: string[];
}> = [
        // Colorado (26+ cities)
        { state: 'CO', municipality: 'Denver', speciesCovered: ['DOG', 'CAT'] },
        { state: 'CO', municipality: 'Aurora', speciesCovered: ['DOG', 'CAT'] },
        { state: 'CO', municipality: 'Fort Collins', speciesCovered: ['DOG', 'CAT'] },
        // Nevada
        { state: 'NV', municipality: 'Clark County', speciesCovered: ['DOG', 'CAT'] },
        { state: 'NV', municipality: 'Reno', effectiveDate: '2020-01-01', speciesCovered: ['DOG', 'CAT'] },
        // New Jersey (150+ local ordinances)
        { state: 'NJ', municipality: 'Union City', speciesCovered: ['DOG', 'CAT'] },
        // Pennsylvania
        { state: 'PA', municipality: 'Philadelphia', speciesCovered: ['DOG', 'CAT'] },
        { state: 'PA', municipality: 'Pittsburgh', speciesCovered: ['DOG', 'CAT'] },
        { state: 'PA', municipality: 'Allentown', speciesCovered: ['DOG', 'CAT'] },
        // Massachusetts
        { state: 'MA', municipality: 'Boston', speciesCovered: ['DOG', 'CAT'] },
        { state: 'MA', municipality: 'Cambridge', speciesCovered: ['DOG', 'CAT'] },
        // Georgia
        { state: 'GA', municipality: 'Atlanta', speciesCovered: ['DOG', 'CAT'] },
        // Florida
        { state: 'FL', municipality: 'Hillsborough County', speciesCovered: ['DOG', 'CAT'] },
        // Texas
        { state: 'TX', municipality: 'Austin', speciesCovered: ['DOG', 'CAT'] },
        { state: 'TX', municipality: 'San Antonio', speciesCovered: ['DOG', 'CAT'] },
    ];

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`🏪 Golden Years Club — Pet Store Bans Import${dryRun ? ' (DRY RUN)' : ''}`);

    const allBans = [
        ...STATEWIDE_BANS.map(b => ({
            state: b.state,
            municipality: null as string | null,
            banType: 'STATEWIDE',
            effectiveDate: b.effectiveDate ? new Date(b.effectiveDate) : null,
            speciesCovered: b.speciesCovered,
            sourceUrl: b.sourceUrl,
        })),
        ...MUNICIPAL_BANS.map(b => ({
            state: b.state,
            municipality: b.municipality,
            banType: 'MUNICIPAL',
            effectiveDate: b.effectiveDate ? new Date(b.effectiveDate) : null,
            speciesCovered: b.speciesCovered,
            sourceUrl: null as string | null,
        })),
    ];

    console.log(`\n📊 ${STATEWIDE_BANS.length} statewide bans, ${MUNICIPAL_BANS.length} municipal bans`);

    if (dryRun) {
        console.log(`\n   Statewide bans:`);
        for (const b of STATEWIDE_BANS) {
            console.log(`      ${b.state} — ${b.speciesCovered.join(', ')} (${b.effectiveDate})`);
        }
        console.log(`\n   Municipal bans (sample):`);
        for (const b of MUNICIPAL_BANS.slice(0, 10)) {
            console.log(`      ${b.state} — ${b.municipality}`);
        }
        return;
    }

    const prisma = await createPrismaClient();
    let created = 0, updated = 0, errors = 0;

    for (const ban of allBans) {
        try {
            await prisma.petStoreBan.upsert({
                where: {
                    state_municipality: {
                        state: ban.state,
                        municipality: ban.municipality ?? '',
                    },
                },
                update: {
                    banType: ban.banType,
                    effectiveDate: ban.effectiveDate,
                    speciesCovered: ban.speciesCovered,
                    sourceUrl: ban.sourceUrl,
                    lastScrapedAt: new Date(),
                },
                create: {
                    state: ban.state,
                    municipality: ban.municipality,
                    banType: ban.banType,
                    effectiveDate: ban.effectiveDate,
                    speciesCovered: ban.speciesCovered,
                    sourceUrl: ban.sourceUrl,
                },
            });
            created++;
        } catch (err: any) {
            errors++;
            if (errors <= 3) console.log(`   ❌ ${ban.state}/${ban.municipality}: ${err.message?.substring(0, 80)}`);
        }
    }

    console.log(`\n🏁 Pet store bans import complete — ${created} upserted, ${errors} errors`);
    await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
