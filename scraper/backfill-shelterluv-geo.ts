/**
 * Backfill ShelterLuv Geo — Database Cross-Reference
 *
 * Resolves geographic data for ShelterLuv orgs by cross-referencing
 * animals in our DB. When a ShelterLuv animal shares a photoUrl or
 * photoHash with an animal in a geo-known shelter (Petfinder, etc),
 * we backfill the ShelterLuv shelter's location from the match.
 *
 * Usage:
 *   npx tsx scraper/backfill-shelterluv-geo.ts --dry-run   # preview
 *   npx tsx scraper/backfill-shelterluv-geo.ts              # apply
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createPrismaClient } from './lib/prisma';
import { hammingDistance, PHASH_THRESHOLD } from './dedup';

const CONFIG_PATH = join(__dirname, 'config/shelterluv-config.json');

const US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
    'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
]);

interface ShelterLuvConfig {
    id: string;
    shelterName: string;
    orgId: string;
    city: string;
    state: string;
    savedQuery?: string;
}

interface ResolvedGeo {
    shelterId: string;
    configId: string;
    city: string;
    state: string;
    zipCode: string | null;
    shelterName: string | null;
    matchSource: 'photoUrl' | 'photoHash';
    sourceShelterName: string;
    sourceShelterId: string;
    matchCount: number;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log('🌍 ShelterLuv Geo Backfill (Database Cross-Reference)');
    console.log(`   Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE (will update DB + config)'}\n`);

    const prisma = await createPrismaClient();

    // Step 1: Find ShelterLuv shelters with unknown geo
    const targetShelters = await prisma.shelter.findMany({
        where: {
            id: { startsWith: 'shelterluv-' },
            state: 'US',
        },
        select: { id: true, name: true, county: true, state: true, zipCode: true },
    });

    console.log(`   Target shelters (state=US): ${targetShelters.length}`);

    if (targetShelters.length === 0) {
        console.log('   ✅ All ShelterLuv shelters already have geo data!');
        process.exit(0);
    }

    // Step 2: Get all geo-known shelters (for cross-referencing)
    const geoShelters = await prisma.shelter.findMany({
        where: {
            state: { not: 'US' },
        },
        select: { id: true, name: true, county: true, state: true, zipCode: true },
    });

    const geoShelterMap = new Map<string, { name: string; county: string; state: string; zipCode: string | null }>();
    for (const s of geoShelters) {
        geoShelterMap.set(s.id, { name: s.name, county: s.county, state: s.state, zipCode: s.zipCode });
    }
    console.log(`   Geo-known shelters: ${geoShelterMap.size}`);

    // Step 3: Get all animals with photoHash from geo-known shelters (for pHash matching)
    const geoHashedAnimals = await prisma.animal.findMany({
        where: {
            photoHash: { not: null },
            shelter: { state: { not: 'US' } },
        },
        select: { id: true, shelterId: true, photoHash: true },
    });
    console.log(`   Geo-known animals with hashes: ${geoHashedAnimals.length}`);

    // Step 4: For each target shelter, cross-reference
    const resolved: ResolvedGeo[] = [];
    let totalAnimalsChecked = 0;

    for (const target of targetShelters) {
        // Get animals belonging to this shelter
        const animals = await prisma.animal.findMany({
            where: { shelterId: target.id },
            select: { id: true, photoUrl: true, photoHash: true },
        });

        if (animals.length === 0) continue;
        totalAnimalsChecked += animals.length;

        // Track which source shelters are matched and how often
        const shelterVotes = new Map<string, { count: number; matchSource: 'photoUrl' | 'photoHash' }>();

        for (const animal of animals) {
            // Strategy 1: photoUrl match
            if (animal.photoUrl) {
                const urlMatch = await prisma.animal.findFirst({
                    where: {
                        photoUrl: animal.photoUrl,
                        shelterId: { not: target.id },
                        shelter: { state: { not: 'US' } },
                    },
                    select: { shelterId: true },
                });

                if (urlMatch) {
                    const key = urlMatch.shelterId;
                    const existing = shelterVotes.get(key);
                    shelterVotes.set(key, {
                        count: (existing?.count || 0) + 1,
                        matchSource: 'photoUrl',
                    });
                    continue; // photoUrl match is definitive, skip pHash
                }
            }

            // Strategy 2: photoHash match
            if (animal.photoHash) {
                for (const candidate of geoHashedAnimals) {
                    if (candidate.shelterId === target.id) continue;
                    const dist = hammingDistance(animal.photoHash!, candidate.photoHash!);
                    if (dist <= PHASH_THRESHOLD) {
                        const key = candidate.shelterId;
                        const existing = shelterVotes.get(key);
                        shelterVotes.set(key, {
                            count: (existing?.count || 0) + 1,
                            matchSource: existing?.matchSource === 'photoUrl' ? 'photoUrl' : 'photoHash',
                        });
                        break; // First hash match is sufficient per animal
                    }
                }
            }
        }

        // Majority vote: pick the source shelter with the most matches
        if (shelterVotes.size > 0) {
            const [bestShelterId, bestVote] = [...shelterVotes.entries()]
                .sort((a, b) => b[1].count - a[1].count)[0];

            const sourceGeo = geoShelterMap.get(bestShelterId);
            if (sourceGeo) {
                // Extract config ID from shelter DB ID (shelterluv-{configId})
                const configId = target.id.replace('shelterluv-', '');

                resolved.push({
                    shelterId: target.id,
                    configId,
                    city: sourceGeo.county, // county field stores city for ShelterLuv
                    state: sourceGeo.state,
                    zipCode: sourceGeo.zipCode,
                    shelterName: sourceGeo.name,
                    matchSource: bestVote.matchSource,
                    sourceShelterName: sourceGeo.name,
                    sourceShelterId: bestShelterId,
                    matchCount: bestVote.count,
                });
            }
        }
    }

    // Step 5: Filter to US-only and report results
    const nonUs = resolved.filter(r => !US_STATES.has(r.state));
    const usResolved = resolved.filter(r => US_STATES.has(r.state));

    if (nonUs.length > 0) {
        console.log(`\n   ⚠ Filtered out ${nonUs.length} non-US results:`);
        for (const r of nonUs) {
            console.log(`      ${r.shelterId} → ${r.city}, ${r.state} (${r.sourceShelterName})`);
        }
    }

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📊 Cross-Reference Results`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Target shelters: ${targetShelters.length}`);
    console.log(`   Animals checked: ${totalAnimalsChecked}`);
    console.log(`   Resolved (US only): ${usResolved.length}`);
    console.log(`   Filtered (non-US): ${nonUs.length}`);
    console.log(`   Still unknown: ${targetShelters.length - usResolved.length}\n`);

    if (usResolved.length > 0) {
        console.log('   Resolved shelters:');
        for (const r of usResolved) {
            const emoji = r.matchSource === 'photoUrl' ? '🔗' : '🧬';
            console.log(
                `   ${emoji} ${r.shelterId} → ${r.city}, ${r.state}` +
                ` (via ${r.matchSource}, ${r.matchCount} matches, source: ${r.sourceShelterName})`,
            );
        }

        // State distribution
        const stateCounts = new Map<string, number>();
        for (const r of usResolved) {
            stateCounts.set(r.state, (stateCounts.get(r.state) || 0) + 1);
        }
        console.log(`\n   State distribution:`);
        for (const [state, count] of [...stateCounts.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`      ${state}: ${count}`);
        }
    }

    if (dryRun) {
        console.log(`\n✅ Dry run complete. Run without --dry-run to apply changes.`);
        process.exit(0);
    }

    // Step 6: Apply changes to DB
    let dbUpdated = 0;
    for (const r of usResolved) {
        try {
            await prisma.shelter.update({
                where: { id: r.shelterId },
                data: {
                    county: r.city,
                    state: r.state,
                    ...(r.zipCode ? { zipCode: r.zipCode } : {}),
                },
            });
            dbUpdated++;
        } catch (err) {
            console.error(`   ❌ DB update failed for ${r.shelterId}: ${(err as Error).message?.substring(0, 100)}`);
        }
    }
    console.log(`\n   DB: ${dbUpdated} shelters updated`);

    // Step 7: Update config JSON
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const configs: ShelterLuvConfig[] = JSON.parse(raw);
    let configUpdated = 0;

    for (const r of usResolved) {
        const config = configs.find(c => c.id === r.configId);
        if (!config) continue;

        let changed = false;
        if (config.city === 'Unknown' && r.city) {
            config.city = r.city;
            changed = true;
        }
        if (config.state === 'US' && r.state && r.state !== 'US') {
            config.state = r.state;
            changed = true;
        }
        if (changed) configUpdated++;
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 4) + '\n');
    console.log(`   Config: ${configUpdated} entries updated`);
    console.log(`\n✅ Backfill complete!`);

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
