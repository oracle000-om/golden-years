/**
 * Socrata Animal Shelter Dataset Discovery
 *
 * Probes known Socrata open data portals for animal shelter
 * outcome/intake datasets using the SODA catalog API.
 *
 * Usage:
 *   npx tsx scraper/discover-socrata.ts
 */

const KNOWN_DOMAINS = [
    // Already configured — include to validate
    'datahub.austintexas.gov',
    'www.dallasopendata.com',
    'data.sonomacounty.ca.gov',
    'data.norfolk.gov',
    'data.montgomerycountymd.gov',
    'data.countyofriverside.us',
    // ── New candidates to probe ──
    'data.longbeach.gov',
    'data.sanjoseca.gov',
    'data.cityofchicago.org',
    'data.lacity.org',
    'data.sfgov.org',
    'bronx.lehman.cuny.edu', // skip non-gov
    'data.denvergov.org',
    'data.louisvilleky.gov',
    'data.tucsonaz.gov',
    'data.cityofnewyork.us',
    'data.chattanooga.gov',
    'data.kcmo.org',
    'data.bloomington.in.gov',
    'data.nashville.gov',
    'data.covingtonky.gov',
    'data.cincinnati-oh.gov',
    'mydata.iadb.org', // skip non-US
    'data.kingcounty.gov',
    'data.detroitmi.gov',
    'datacatalog.cookcountyil.gov',
    'data.cityofsacramento.org',
    'data.cityoffortworth.com',
    'data.sandiegocounty.gov',
    'data.cityoftacoma.org',
    'data.slcgov.com',
    'data.boston.gov',
    'data.seattle.gov',
    'data.austintexas.gov', // old domain
    'data.brla.gov',
    'data.coj.net',
    'data.hartford.gov',
    'data.nola.gov',
    'data.providenceri.gov',
];

interface CatalogResult {
    domain: string;
    datasetName: string;
    resourceId: string;
    description: string;
    updatedAt: string;
    keywords: string[];
}

async function probeDomain(domain: string): Promise<CatalogResult[]> {
    const results: CatalogResult[] = [];

    // Try the Socrata catalog/discovery API
    const searchTerms = ['animal shelter', 'animal outcome', 'animal intake', 'animal services', 'shelter animals'];

    for (const term of searchTerms) {
        try {
            const url = `https://${domain}/api/catalog/v1?q=${encodeURIComponent(term)}&limit=20`;
            const resp = await fetch(url, {
                signal: AbortSignal.timeout(8000),
                headers: { 'User-Agent': 'GoldenYearsClub/1.0' },
            });
            if (!resp.ok) continue;
            const data = await resp.json() as any;
            if (!data.results) continue;

            for (const r of data.results) {
                const resource = r.resource || {};
                const name = (resource.name || '').toLowerCase();
                const desc = (resource.description || '').toLowerCase();
                const combined = `${name} ${desc}`;

                // Check if it's animal-related
                const animalKeywords = ['animal', 'shelter', 'pet', 'intake', 'outcome', 'adoption', 'euthanasia', 'stray'];
                const hasAnimal = animalKeywords.some(k => combined.includes(k));

                if (hasAnimal && resource.id) {
                    // Avoid duplicates
                    if (!results.some(r => r.resourceId === resource.id)) {
                        results.push({
                            domain,
                            datasetName: resource.name,
                            resourceId: resource.id,
                            description: (resource.description || '').substring(0, 200),
                            updatedAt: resource.updatedAt || '',
                            keywords: resource.columns_name?.filter((c: string) => {
                                const cl = c.toLowerCase();
                                return ['outcome', 'intake', 'breed', 'animal', 'type', 'euthan', 'date', 'sex', 'age'].some(k => cl.includes(k));
                            }) || [],
                        });
                    }
                }
            }
        } catch {
            // Timeout or not a Socrata domain
        }
    }

    return results;
}

async function main() {
    console.log('🔍 Socrata Animal Shelter Dataset Discovery\n');

    const already = new Set([
        'datahub.austintexas.gov',
        'data.austintexas.gov',
        'www.dallasopendata.com',
        'data.sonomacounty.ca.gov',
        'data.norfolk.gov',
        'data.kingcounty.gov',
        'data.bloomington.in.gov',
    ]);

    const allResults: CatalogResult[] = [];
    let probed = 0;

    for (const domain of KNOWN_DOMAINS) {
        process.stdout.write(`   Probing ${domain}...`);
        const results = await probeDomain(domain);
        probed++;

        if (results.length > 0) {
            const isNew = !already.has(domain);
            console.log(` ${isNew ? '🆕' : '✅'} ${results.length} dataset(s)`);
            for (const r of results) {
                console.log(`      📊 ${r.datasetName} (${r.resourceId})`);
                if (r.keywords.length > 0) {
                    console.log(`         Columns: ${r.keywords.join(', ')}`);
                }
            }
            allResults.push(...results);
        } else {
            console.log(' ❌ no animal datasets');
        }
    }

    // Summary
    const newDomains = allResults.filter(r => !already.has(r.domain));
    const newUniqueDomains = [...new Set(newDomains.map(r => r.domain))];

    console.log(`\n═══════════════════════════════════════════`);
    console.log(`📈 Discovery Summary`);
    console.log(`═══════════════════════════════════════════`);
    console.log(`   Domains probed: ${probed}`);
    console.log(`   Domains with animal data: ${[...new Set(allResults.map(r => r.domain))].length}`);
    console.log(`   Total datasets found: ${allResults.length}`);
    console.log(`   NEW domains (not yet configured): ${newUniqueDomains.length}`);

    if (newUniqueDomains.length > 0) {
        console.log(`\n   🆕 New domains to investigate:`);
        for (const d of newUniqueDomains) {
            const datasets = newDomains.filter(r => r.domain === d);
            console.log(`      ${d}:`);
            for (const ds of datasets) {
                // Check if it has outcome-related columns
                const hasOutcome = ds.keywords.some(k => k.toLowerCase().includes('outcome'));
                const emoji = hasOutcome ? '🎯' : '📊';
                console.log(`         ${emoji} ${ds.datasetName} (${ds.resourceId})`);
            }
        }
    }

    process.exit(0);
}

main();
