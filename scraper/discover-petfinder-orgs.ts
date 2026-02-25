/**
 * Petfinder Org Discovery — National Pagination Sweep
 *
 * Paginates through Petfinder's national senior animal listings
 * to discover org UUIDs from search results. No location filter needed —
 * just paginate through pages of senior dogs/cats nationally.
 *
 * Usage:
 *   npx tsx scraper/discover-petfinder-orgs.ts
 *   npx tsx scraper/discover-petfinder-orgs.ts --pages=50   # more pages
 */

import 'dotenv/config';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const MAX_PAGES = parseInt(process.argv.find(a => a.startsWith('--pages='))?.split('=')[1] || '30');
const PAGE_SIZE = 100;

// ── GraphQL Query ──

const SEARCH_QUERY = `
query SearchAnimal(
    $pagination: PaginationInfoInput!,
    $sort: [SortInput!]!,
    $filters: AnimalSearchFiltersInput!,
    $facets: AnimalSearchFacetsInput
) {
    searchAnimal(
        pagination: $pagination
        sort: $sort
        filters: $filters
        facets: $facets
        isConsumer: true
    ) {
        totalCount
        animals {
            animalId
            animalName
            animalType
            organization {
                organizationId
                organizationName
                organizationCity
                organizationState
            }
            physical {
                age { value }
                sex
                size { label }
                breed { primary secondary }
            }
            _media { s3Url }
        }
    }
}`;

interface DiscoveredOrg {
    uuid: string;
    name: string;
    city: string;
    state: string;
    seniorCount: number;
    hasPhotos: boolean;
}

async function fetchPage(animalType: 'Dog' | 'Cat', page: number): Promise<{
    animals: any[];
    totalCount: number;
}> {
    const variables = {
        pagination: { fromPage: page, pageSize: PAGE_SIZE },
        sort: [],
        filters: {
            animal_type: [animalType],
            age: ['SENIOR'],
            adoption_status: ['ADOPTABLE'],
            record_status: ['PUBLISHED'],
        },
        facets: {},
    };

    const response = await fetch('https://psl.petfinder.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://www.petfinder.com',
            'Referer': 'https://www.petfinder.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
            operationName: 'SearchAnimal',
            query: SEARCH_QUERY,
            variables,
        }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    const result = await response.json() as any;
    if (result.errors?.length) {
        throw new Error(`GQL: ${result.errors[0]?.message?.substring(0, 100)}`);
    }

    return {
        animals: result.data?.searchAnimal?.animals || [],
        totalCount: result.data?.searchAnimal?.totalCount || 0,
    };
}

async function main() {
    console.log(`🔍 Petfinder Org Discovery — National Senior Sweep`);
    console.log(`   Max pages per species: ${MAX_PAGES} (${MAX_PAGES * PAGE_SIZE} animals)\n`);

    const allOrgs = new Map<string, DiscoveredOrg>();

    for (const type of ['Dog', 'Cat'] as const) {
        console.log(`\n🐾 Sweeping senior ${type}s...`);

        let page = 0;
        let totalCount = 0;
        let animalsScanned = 0;
        let consecutiveEmpty = 0;

        while (page < MAX_PAGES) {
            try {
                const result = await fetchPage(type, page);

                if (page === 0) {
                    totalCount = result.totalCount;
                    console.log(`   Total available: ${totalCount} senior ${type.toLowerCase()}s nationwide`);
                }

                if (result.animals.length === 0) {
                    consecutiveEmpty++;
                    if (consecutiveEmpty >= 2) break;
                    page++;
                    continue;
                }
                consecutiveEmpty = 0;

                for (const a of result.animals) {
                    const org = a.organization;
                    if (!org?.organizationId) continue;

                    const hasPhotos = (a._media?.length || 0) > 0;
                    const existing = allOrgs.get(org.organizationId);
                    if (existing) {
                        existing.seniorCount++;
                        if (hasPhotos) existing.hasPhotos = true;
                    } else {
                        allOrgs.set(org.organizationId, {
                            uuid: org.organizationId,
                            name: org.organizationName || 'Unknown',
                            city: org.organizationCity || 'Unknown',
                            state: org.organizationState || 'US',
                            seniorCount: 1,
                            hasPhotos,
                        });
                    }
                }

                animalsScanned += result.animals.length;
                if ((page + 1) % 5 === 0 || page === 0) {
                    console.log(`   Page ${page + 1}: scanned ${animalsScanned} animals, ${allOrgs.size} unique orgs so far`);
                }

                page++;
                await new Promise(r => setTimeout(r, 400));

            } catch (err) {
                console.error(`   ❌ Page ${page}: ${(err as Error).message?.substring(0, 100)}`);
                break;
            }
        }

        console.log(`   ✅ ${type}s done: scanned ${animalsScanned}/${totalCount}, ${allOrgs.size} orgs discovered`);
    }

    // Load existing config
    const configPath = join(__dirname, 'config/petfinder-config.json');
    let existingUuids = new Set<string>();
    let existingConfig: any[] = [];
    try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        existingUuids = new Set(existingConfig.map((e: any) => e.petfinderOrgId));
    } catch { /* no existing config */ }

    // Filter to new orgs with photos
    const newOrgs = [...allOrgs.values()]
        .filter(o => !existingUuids.has(o.uuid) && o.hasPhotos)
        .sort((a, b) => b.seniorCount - a.seniorCount);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Discovery Results`);
    console.log(`   Total unique orgs found: ${allOrgs.size}`);
    console.log(`   Already configured: ${[...allOrgs.values()].filter(o => existingUuids.has(o.uuid)).length}`);
    console.log(`   New orgs with photos: ${newOrgs.length}`);
    console.log(`   Total seniors across new orgs: ${newOrgs.reduce((s, o) => s + o.seniorCount, 0)}`);
    console.log(`${'='.repeat(60)}\n`);

    // Show top orgs
    console.log(`🏆 Top new orgs by senior count:\n`);
    for (const org of newOrgs.slice(0, 80)) {
        console.log(`   ${org.seniorCount.toString().padStart(3)} seniors | ${org.name.padEnd(45)} | ${org.city}, ${org.state} | ${org.uuid}`);
    }

    // State breakdown
    const stateCount = new Map<string, number>();
    for (const o of newOrgs) {
        stateCount.set(o.state, (stateCount.get(o.state) || 0) + 1);
    }
    console.log(`\n📍 States covered: ${stateCount.size}`);
    const sortedStates = [...stateCount.entries()].sort((a, b) => b[1] - a[1]);
    for (const [st, ct] of sortedStates.slice(0, 15)) {
        console.log(`   ${st}: ${ct} orgs`);
    }

    // Generate config entries
    const newConfigEntries = newOrgs.map(org => ({
        id: `pf-${org.state.toLowerCase()}-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').substring(0, 40)}`,
        shelterName: org.name,
        city: org.city,
        state: org.state,
        petfinderOrgId: org.uuid,
    }));

    // Merge and write
    const mergedConfig = [...existingConfig, ...newConfigEntries];
    writeFileSync(configPath, JSON.stringify(mergedConfig, null, 4) + '\n');

    console.log(`\n✅ Written ${mergedConfig.length} total orgs to petfinder-config.json`);
    console.log(`   (${existingConfig.length} existing + ${newConfigEntries.length} new)`);

    process.exit(0);
}

main();
