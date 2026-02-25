/**
 * Discover Petango Authkeys — Automated PetPoint Shelter Scanner
 *
 * Scans known municipal shelter websites for embedded Petango/24PetConnect
 * iframes and extracts authkey parameters. Validates each key by hitting
 * the AdoptableSearch API.
 *
 * Usage:
 *   npx tsx scraper/discover-petango.ts              # full scan
 *   npx tsx scraper/discover-petango.ts --dry-run     # show results only
 *   npx tsx scraper/discover-petango.ts --validate     # validate existing config keys too
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────

interface ShelterTarget {
    id: string;
    shelterName: string;
    city: string;
    state: string;
    /** URLs to scan for embedded authkeys */
    urls: string[];
    /** Known 24PetConnect org code (e.g., DNVR for Denver) */
    orgCode?: string;
}

interface DiscoveredKey {
    id: string;
    shelterName: string;
    authkey: string;
    city: string;
    state: string;
    source: string; // URL where we found it
    animalCount?: number;
}

interface ExistingConfig {
    id: string;
    shelterName: string;
    authkey: string;
    city: string;
    state: string;
}

// ── Configuration ──────────────────────────────────────

const CONFIG_PATH = join(__dirname, 'config/petango-config.json');

/**
 * Target shelters known to use PetPoint/24PetConnect.
 * URLs are their adoption search or pet listing pages that embed
 * Petango iframes or link to 24petconnect.
 */
const TARGETS: ShelterTarget[] = [
    {
        id: 'denver-co-petango',
        shelterName: 'Denver Animal Shelter',
        city: 'Denver',
        state: 'CO',
        urls: [
            'https://www.denvergov.org/Government/Agencies-Departments-Offices/Denver-Animal-Protection/Adopt',
            'https://www.denvergov.org/content/denvergov/en/denver-animal-shelter.html',
        ],
        orgCode: 'DNVR',
    },
    {
        id: 'louisville-ky-petango',
        shelterName: 'Louisville Metro Animal Services',
        city: 'Louisville',
        state: 'KY',
        urls: [
            'https://louisvilleky.gov/government/animal-services/adoptable-pets',
            'https://www.louisvilleky.gov/animal-services',
        ],
        orgCode: 'LMAS',
    },
    {
        id: 'san-antonio-tx-petango',
        shelterName: 'San Antonio Animal Care Services',
        city: 'San Antonio',
        state: 'TX',
        urls: [
            'https://www.sanantonio.gov/Animal-Care/Adopt-a-Pet',
            'https://www.sanantonio.gov/Animal-Care/ACS-Convero-Pet-Search',
        ],
        orgCode: 'SATX',
    },
    {
        id: 'fort-worth-tx-petango',
        shelterName: 'Fort Worth Animal Care & Control',
        city: 'Fort Worth',
        state: 'TX',
        urls: [
            'https://www.fortworthtexas.gov/departments/code-compliance/animal-care/adopt',
            'https://www.fortworthtexas.gov/departments/code-compliance/animals-at-fwacc',
        ],
        orgCode: 'FWTX',
    },
    {
        id: 'jacksonville-fl-petango',
        shelterName: 'Jacksonville Animal Care & Protective Services',
        city: 'Jacksonville',
        state: 'FL',
        urls: [
            'https://www.coj.net/departments/neighborhoods/animal-care-and-protective-services/adopt-a-pet',
        ],
        orgCode: 'JCFL',
    },
    {
        id: 'charlotte-nc-petango',
        shelterName: 'Charlotte-Mecklenburg Animal Care & Control',
        city: 'Charlotte',
        state: 'NC',
        urls: [
            'https://www.mecknc.gov/animalcontrol/adoption/pages/default.aspx',
            'https://pets.mecknc.gov/',
        ],
        orgCode: 'CLTM',
    },
    {
        id: 'tucson-az-petango',
        shelterName: 'Pima Animal Care Center',
        city: 'Tucson',
        state: 'AZ',
        urls: [
            'https://www.pima.gov/government/departments/animal-care/adoptable-pets',
            'https://www.pimaanimalcare.org/adopt',
        ],
        orgCode: 'PIMC',
    },
    {
        id: 'columbus-oh-petango',
        shelterName: 'Columbus Humane',
        city: 'Columbus',
        state: 'OH',
        urls: [
            'https://www.columbushumane.org/adopt',
        ],
        orgCode: 'CMBS',
    },
    {
        id: 'indianapolis-in-petango',
        shelterName: 'Indianapolis Animal Care Services',
        city: 'Indianapolis',
        state: 'IN',
        urls: [
            'https://www.indy.gov/activity/adopt-an-animal',
            'https://www.indyacs.org/',
        ],
        orgCode: 'INDY',
    },
    {
        id: 'nashville-tn-petango',
        shelterName: 'Metro Animal Care & Control Nashville',
        city: 'Nashville',
        state: 'TN',
        urls: [
            'https://www.nashville.gov/departments/health/animal-care',
            'https://www.nashvillehumane.org/adopt',
        ],
        orgCode: 'MACC',
    },
    {
        id: 'hillsborough-fl-petango',
        shelterName: 'Hillsborough County Pet Resource Center',
        city: 'Tampa',
        state: 'FL',
        urls: [
            'https://www.hillsboroughcounty.org/residents/animals-and-pets/pet-resource-center/adopt-a-pet',
        ],
        orgCode: 'HLSB',
    },
    {
        id: 'palm-beach-fl-petango',
        shelterName: 'Palm Beach County Animal Care & Control',
        city: 'West Palm Beach',
        state: 'FL',
        urls: [
            'https://discover.pbcgov.org/publicsafety/animalcare/Pages/Adoptable-Pets.aspx',
        ],
        orgCode: 'PBCF',
    },
    {
        id: 'broward-fl-petango',
        shelterName: 'Broward County Animal Care & Adoption',
        city: 'Fort Lauderdale',
        state: 'FL',
        urls: [
            'https://www.broward.org/Animal/Pages/Adopt.aspx',
        ],
        orgCode: 'BRWD',
    },
    {
        id: 'pinellas-fl-petango',
        shelterName: 'Pinellas County Animal Services',
        city: 'Largo',
        state: 'FL',
        urls: [
            'https://www.pinellas.gov/Animal-Services/Adopt-a-Pet',
            'https://www.pinellascounty.org/animalservices/adopt/',
        ],
        orgCode: 'PNLS',
    },
    {
        id: 'kansas-city-mo-petango',
        shelterName: 'KC Pet Project',
        city: 'Kansas City',
        state: 'MO',
        urls: [
            'https://kcpetproject.org/adopt/',
        ],
        orgCode: 'KCPP',
    },
    {
        id: 'long-beach-ca-petango',
        shelterName: 'Long Beach Animal Care Services',
        city: 'Long Beach',
        state: 'CA',
        urls: [
            'https://www.longbeach.gov/acs/pet-adoption/',
        ],
        orgCode: 'LBCA',
    },
    {
        id: 'riverside-ca-petango',
        shelterName: 'Riverside County Animal Services',
        city: 'Jurupa Valley',
        state: 'CA',
        urls: [
            'https://rfrma.gov/animal-services/adopt-a-pet/',
            'https://rfrma.gov/animal-services/',
        ],
        orgCode: 'RVSD',
    },
    {
        id: 'el-paso-tx-petango',
        shelterName: 'El Paso Animal Services',
        city: 'El Paso',
        state: 'TX',
        urls: [
            'https://www.elpasotexas.gov/animal-services/adopt/',
        ],
        orgCode: 'EPTX',
    },
    {
        id: 'clark-county-nv-petango',
        shelterName: 'Clark County Animal Protection',
        city: 'Las Vegas',
        state: 'NV',
        urls: [
            'https://www.clarkcountynv.gov/Departments/animal-protection/Pages/adoption.aspx',
        ],
        orgCode: 'CLNV',
    },
    {
        id: 'memphis-tn-petango',
        shelterName: 'Memphis Animal Services',
        city: 'Memphis',
        state: 'TN',
        urls: [
            'https://memphisanimalservices.com/adopt/',
        ],
        orgCode: 'MMPS',
    },
];

// ── Authkey Extraction ─────────────────────────────────

const AUTHKEY_PATTERNS = [
    /authkey=([a-z0-9]{30,60})/gi,
    /auth_key=([a-z0-9]{30,60})/gi,
    /[?&]key=([a-z0-9]{30,60})/gi,
];

const PETANGO_URL_PATTERNS = [
    /ws\.petango\.com/i,
    /24petconnect\.com/i,
    /petango\.com/i,
];

async function fetchPage(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15_000),
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; GoldenYearsClub/1.0; +https://goldenyears.club)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    }
}

function extractAuthkeys(html: string): { authkey: string; context: string }[] {
    const keys: { authkey: string; context: string }[] = [];
    const seen = new Set<string>();

    for (const pattern of AUTHKEY_PATTERNS) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            const key = match[1].toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                // Get surrounding context
                const start = Math.max(0, match.index - 100);
                const end = Math.min(html.length, match.index + match[0].length + 100);
                const context = html.substring(start, end).replace(/\s+/g, ' ').trim();
                keys.push({ authkey: key, context });
            }
        }
    }

    return keys;
}

// ── Validation ─────────────────────────────────────────

const API_BASE = 'https://ws.petango.com/webservices/wsAdoption.asmx';

async function validateAuthkey(authkey: string): Promise<{ valid: boolean; animalCount: number }> {
    try {
        const params = new URLSearchParams({
            authkey,
            speciesID: '1', // Dog
            sex: '',
            ageGroup: '',
            location: '',
            site: '',
            onHold: 'A',
            orderBy: 'Name',
            primaryBreed: '',
            secondaryBreed: '',
            specialNeeds: '',
            noDogs: '',
            noCats: '',
            noKids: '',
            stageID: '',
        });

        const url = `${API_BASE}/AdoptableSearch?${params.toString()}`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(20_000),
            headers: { 'User-Agent': 'GoldenYearsClub/1.0' },
        });

        if (!response.ok) return { valid: false, animalCount: 0 };

        const xml = await response.text();

        // Check if we got a valid response (not an error page)
        if (xml.includes('Error') && xml.includes('Invalid') || xml.length < 100) {
            return { valid: false, animalCount: 0 };
        }

        // Count AnimalID tags as a proxy for animal count
        const animalMatches = xml.match(/<AnimalID>/gi);
        const count = animalMatches?.length ?? 0;
        return { valid: count > 0 || xml.includes('adoptableSearch'), animalCount: count };
    } catch {
        return { valid: false, animalCount: 0 };
    }
}

// ── 24PetConnect Direct Approach ───────────────────────

/**
 * Try to find authkeys by checking if the shelter has a
 * 24PetConnect page that embeds a Petango search widget.
 */
async function tryDirectPetConnect(target: ShelterTarget): Promise<{ authkey: string; context: string }[]> {
    if (!target.orgCode) return [];

    const urls = [
        `https://www.24petconnect.com/partnersearch?p=${target.orgCode}`,
        `https://ws.petango.com/webservices/adoptablesearch/wsAdoptableAnimals2.aspx?css=https://ws.petango.com/WebServices/adoptablesearch/css/styles.css&authkey=`,
    ];

    const keys: { authkey: string; context: string }[] = [];

    for (const url of urls) {
        const html = await fetchPage(url);
        if (html) {
            keys.push(...extractAuthkeys(html));
        }
        await new Promise(r => setTimeout(r, 500));
    }

    return keys;
}

// ── Main ───────────────────────────────────────────────

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const validateExisting = process.argv.includes('--validate');

    console.log(`🔍 Golden Years Club — Petango Authkey Discovery${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Scanning ${TARGETS.length} shelter websites for PetPoint/24PetConnect authkeys...\n`);

    // Load existing config
    const existingConfig: ExistingConfig[] = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const existingKeys = new Set(existingConfig.map(c => c.authkey.toLowerCase()));
    console.log(`   📂 Existing config: ${existingConfig.length} shelters\n`);

    // Optionally validate existing keys
    if (validateExisting) {
        console.log('   🔑 Validating existing authkeys...');
        for (const config of existingConfig) {
            const result = await validateAuthkey(config.authkey);
            const status = result.valid ? '✅' : '❌';
            console.log(`      ${status} ${config.shelterName} (${config.authkey.substring(0, 12)}...): ${result.animalCount} animals`);
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log('');
    }

    // Discover new keys
    const discovered: DiscoveredKey[] = [];
    let scanned = 0;

    for (const target of TARGETS) {
        console.log(`   🏠 ${target.shelterName} (${target.city}, ${target.state})`);
        let foundKeys: { authkey: string; context: string }[] = [];

        // Method 1: Scan shelter website pages for embedded authkeys
        for (const url of target.urls) {
            console.log(`      Scanning: ${url}`);
            const html = await fetchPage(url);
            if (html) {
                const hasPetangoRef = PETANGO_URL_PATTERNS.some(p => p.test(html));
                if (hasPetangoRef) {
                    console.log(`      → Found Petango/24PetConnect reference!`);
                }
                const keys = extractAuthkeys(html);
                if (keys.length > 0) {
                    console.log(`      → Found ${keys.length} authkey(s)!`);
                    foundKeys.push(...keys);
                }
            } else {
                console.log(`      → Page unreachable`);
            }
            await new Promise(r => setTimeout(r, 800));
        }

        // Method 2: Try 24PetConnect direct lookup
        if (foundKeys.length === 0 && target.orgCode) {
            console.log(`      Trying 24PetConnect direct lookup (${target.orgCode})...`);
            const directKeys = await tryDirectPetConnect(target);
            if (directKeys.length > 0) {
                console.log(`      → Found ${directKeys.length} authkey(s) via 24PetConnect!`);
                foundKeys.push(...directKeys);
            }
        }

        // Deduplicate and filter out existing keys
        const newKeys = foundKeys.filter(k => !existingKeys.has(k.authkey.toLowerCase()));
        const dedupedKeys = [...new Map(newKeys.map(k => [k.authkey.toLowerCase(), k])).values()];

        // Validate new keys
        for (const key of dedupedKeys) {
            console.log(`      Validating authkey: ${key.authkey.substring(0, 12)}...`);
            const result = await validateAuthkey(key.authkey);
            if (result.valid) {
                console.log(`      ✅ Valid! ${result.animalCount} animals found`);
                discovered.push({
                    id: target.id,
                    shelterName: target.shelterName,
                    authkey: key.authkey,
                    city: target.city,
                    state: target.state,
                    source: key.context.substring(0, 100),
                    animalCount: result.animalCount,
                });
                existingKeys.add(key.authkey.toLowerCase());
            } else {
                console.log(`      ❌ Invalid or empty`);
            }
            await new Promise(r => setTimeout(r, 1500)); // Rate limit API calls
        }

        if (dedupedKeys.length === 0 && foundKeys.length === 0) {
            console.log(`      ⚠ No authkeys found — may not use PetPoint`);
        } else if (dedupedKeys.length === 0 && foundKeys.length > 0) {
            console.log(`      ℹ Authkey(s) found but already in config`);
        }

        console.log('');
        scanned++;
        // Progress
        if (scanned % 5 === 0) {
            console.log(`   ... ${scanned}/${TARGETS.length} shelters scanned, ${discovered.length} new keys found\n`);
        }
    }

    // Summary
    console.log('═══════════════════════════════════════════');
    console.log(`🏁 Discovery Complete`);
    console.log(`   Scanned: ${scanned} shelters`);
    console.log(`   Discovered: ${discovered.length} new authkeys`);
    console.log('');

    if (discovered.length > 0) {
        console.log('   New shelters found:');
        for (const d of discovered) {
            console.log(`      🆕 ${d.shelterName} (${d.city}, ${d.state}) — ${d.animalCount} animals`);
        }
        console.log('');

        if (!dryRun) {
            // Append to config
            const newEntries = discovered.map(d => ({
                id: d.id,
                shelterName: `${d.shelterName} (PetPoint)`,
                authkey: d.authkey,
                city: d.city,
                state: d.state,
            }));

            const updatedConfig = [...existingConfig, ...newEntries];
            writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 4) + '\n');
            console.log(`   💾 Updated ${CONFIG_PATH} with ${newEntries.length} new entries`);
            console.log(`   Total shelters in config: ${updatedConfig.length}`);
        } else {
            console.log('   🏃 Dry run — no changes written. Remove --dry-run to persist.');
            console.log('');
            console.log('   Config entries that would be added:');
            console.log(JSON.stringify(
                discovered.map(d => ({
                    id: d.id,
                    shelterName: `${d.shelterName} (PetPoint)`,
                    authkey: d.authkey,
                    city: d.city,
                    state: d.state,
                })),
                null,
                4
            ));
        }
    } else {
        console.log('   No new authkeys discovered. This could mean:');
        console.log('   1. Target shelters don\'t actually use PetPoint');
        console.log('   2. Authkeys are loaded dynamically via JavaScript (not in initial HTML)');
        console.log('   3. Shelters have migrated to 24PetConnect without embedded iframes');
        console.log('');
        console.log('   💡 Try manually checking shelter websites in a browser for Petango/24PetConnect iframes.');
    }

    process.exit(0);
}

main();
