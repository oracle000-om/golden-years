/**
 * Breed Health Database — TheDogAPI + TheCatAPI Adapter
 *
 * Fetches breed data from free public APIs and normalizes into
 * BreedProfile records with life expectancy, temperament, and
 * derived senior age thresholds.
 *
 * Data sources:
 *   - TheDogAPI: https://api.thedogapi.com/v1/breeds
 *   - TheCatAPI: https://api.thecatapi.com/v1/breeds
 *
 * Auth: Optional API key for TheDogAPI (higher rate limits).
 *       TheCatAPI is free with no key required.
 */

export interface BreedProfileData {
    name: string;
    species: 'DOG' | 'CAT';
    breedGroup: string | null;
    lifeExpectancyLow: number | null;
    lifeExpectancyHigh: number | null;
    temperament: string | null;
    healthRiskScore: number | null;
    commonConditions: string[];
    seniorAgeThreshold: number | null;
    careNotes: string | null;
    sourceApi: string;
}

interface DogApiBreed {
    id: number;
    name: string;
    breed_group?: string;
    life_span?: string;        // "10 - 12 years" or "10 - 12"
    temperament?: string;
    weight?: { metric?: string };
    height?: { metric?: string };
}

interface CatApiBreed {
    id: string;
    name: string;
    life_span?: string;        // "12 - 15"
    temperament?: string;
    health_issues?: number;    // 1-5 scale
    description?: string;
    origin?: string;
}

/**
 * Parse a life_span string like "10 - 12 years" or "10 - 12"
 * into { low, high } integer values.
 */
function parseLifeSpan(lifeSpan: string | undefined): { low: number | null; high: number | null } {
    if (!lifeSpan) return { low: null, high: null };

    // Remove "years" and extra whitespace
    const cleaned = lifeSpan.replace(/years?/gi, '').trim();

    // Try "X - Y" format
    const rangeMatch = cleaned.match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (rangeMatch) {
        return {
            low: parseInt(rangeMatch[1], 10),
            high: parseInt(rangeMatch[2], 10),
        };
    }

    // Try single number
    const singleMatch = cleaned.match(/(\d+)/);
    if (singleMatch) {
        const val = parseInt(singleMatch[1], 10);
        return { low: val, high: val };
    }

    return { low: null, high: null };
}

/**
 * Derive senior age threshold: ~75% of life expectancy high.
 * This is the age at which a breed is considered "senior".
 */
function deriveSeniorThreshold(lifeExpHigh: number | null, species: 'DOG' | 'CAT'): number | null {
    if (lifeExpHigh == null) {
        return species === 'DOG' ? 7 : 10; // Fallback defaults
    }
    return Math.round(lifeExpHigh * 0.75);
}

/**
 * Fetch all dog breeds from TheDogAPI.
 */
async function fetchDogBreeds(): Promise<BreedProfileData[]> {
    const apiKey = process.env.THEDOGAPI_KEY;
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'GoldenYearsClub/1.0',
    };
    if (apiKey) {
        headers['x-api-key'] = apiKey;
    }

    const response = await fetch('https://api.thedogapi.com/v1/breeds', { headers });
    if (!response.ok) {
        throw new Error(`TheDogAPI returned ${response.status}`);
    }

    const breeds = await response.json() as DogApiBreed[];
    console.log(`   🐕 TheDogAPI: ${breeds.length} breeds`);

    return breeds.map(b => {
        const { low, high } = parseLifeSpan(b.life_span);
        return {
            name: b.name,
            species: 'DOG' as const,
            breedGroup: b.breed_group || null,
            lifeExpectancyLow: low,
            lifeExpectancyHigh: high,
            temperament: b.temperament || null,
            healthRiskScore: null, // Not available from TheDogAPI
            commonConditions: [],
            seniorAgeThreshold: deriveSeniorThreshold(high, 'DOG'),
            careNotes: null,
            sourceApi: 'thedogapi',
        };
    });
}

/**
 * Fetch all cat breeds from TheCatAPI.
 */
async function fetchCatBreeds(): Promise<BreedProfileData[]> {
    const response = await fetch('https://api.thecatapi.com/v1/breeds', {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'GoldenYearsClub/1.0',
        },
    });

    if (!response.ok) {
        throw new Error(`TheCatAPI returned ${response.status}`);
    }

    const breeds = await response.json() as CatApiBreed[];
    console.log(`   🐱 TheCatAPI: ${breeds.length} breeds`);

    return breeds.map(b => {
        const { low, high } = parseLifeSpan(b.life_span);
        return {
            name: b.name,
            species: 'CAT' as const,
            breedGroup: null,
            lifeExpectancyLow: low,
            lifeExpectancyHigh: high,
            temperament: b.temperament || null,
            healthRiskScore: b.health_issues ?? null,
            commonConditions: [],
            seniorAgeThreshold: deriveSeniorThreshold(high, 'CAT'),
            careNotes: b.description ? b.description.substring(0, 500) : null,
            sourceApi: 'thecatapi',
        };
    });
}

// ── AKC Breed Scraper ──

interface AkcJsonLd {
    '@type': string;
    name?: string;
    mainEntity?: {
        '@type': string;
        'csvw:tableSchema'?: {
            'csvw:columns'?: Array<{
                'csvw:name'?: string;
                'csvw:cells'?: Array<{ 'csvw:value'?: string }>;
            }>;
        };
    };
}

/**
 * Extract breed data from AKC page JSON-LD structured data.
 */
function parseAkcJsonLd(jsonStr: string, slug: string): BreedProfileData | null {
    try {
        const data = JSON.parse(jsonStr) as AkcJsonLd;
        if (data['@type'] !== 'Dataset' || !data.mainEntity) return null;

        const columns = data.mainEntity['csvw:tableSchema']?.['csvw:columns'] || [];

        let lifeExpStr: string | undefined;
        let breedGroup: string | null = null;
        const breedName = data.name || slug;

        for (const col of columns) {
            const name = col['csvw:name'] || '';
            const value = col['csvw:cells']?.[0]?.['csvw:value'] || '';

            if (name === 'Life Expectancy') {
                // Format: "Life Expectancy: 11-13 years"
                const match = value.match(/(\d+\s*[-–—]\s*\d+)/);
                lifeExpStr = match ? match[1] : undefined;
            } else if (name === 'Group') {
                // Format: "Group: Sporting Group"
                breedGroup = value.replace(/^Group:\s*/i, '').trim() || null;
            }
        }

        const { low, high } = parseLifeSpan(lifeExpStr);

        return {
            name: breedName,
            species: 'DOG',
            breedGroup,
            lifeExpectancyLow: low,
            lifeExpectancyHigh: high,
            temperament: null, // AKC doesn't include this in JSON-LD
            healthRiskScore: null,
            commonConditions: [],
            seniorAgeThreshold: deriveSeniorThreshold(high, 'DOG'),
            careNotes: null,
            sourceApi: 'akc',
        };
    } catch {
        return null;
    }
}

/**
 * Fetch breed data from AKC by scraping JSON-LD + HTML fallback from breed pages.
 *
 * AKC breed pages may embed structured data (Schema.org Dataset) with
 * life expectancy and breed group in JSON-LD format. When JSON-LD is missing,
 * we fall back to HTML regex extraction.
 */
async function fetchAkcBreeds(): Promise<BreedProfileData[]> {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
    };

    // Step 1: Get all breed slugs from the directory page
    console.log('   🏆 AKC: Fetching breed directory...');
    const dirResponse = await fetch('https://www.akc.org/dog-breeds/', { headers });
    if (!dirResponse.ok) throw new Error(`AKC directory returned ${dirResponse.status}`);

    const dirHtml = await dirResponse.text();
    const slugMatches = dirHtml.match(/\/dog-breeds\/([a-z0-9-]+)\//g) || [];
    const slugs = [...new Set(slugMatches.map(m => m.replace(/\/dog-breeds\//g, '').replace(/\//g, '')))];

    // Filter out non-breed slugs (category pages, etc.)
    const skipSlugs = new Set(['page', 'group', 'apartment-dogs', 'best-family-dogs',
        'smartest-dogs', 'hypoallergenic-dogs', 'best-guard-dogs', 'smallest-dog-breeds',
        'medium-dog-breeds', 'largest-dog-breeds', 'best-dogs-for-kids']);
    const breedSlugs = slugs.filter(s => !skipSlugs.has(s) && s.length > 2);
    console.log(`   🏆 AKC: ${breedSlugs.length} breed pages found`);

    // Helper: title-case a slug
    const slugToName = (slug: string): string =>
        slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Helper: parse breed from HTML when JSON-LD is missing
    const parseAkcHtml = (html: string, slug: string): BreedProfileData | null => {
        // Extract life expectancy from HTML patterns
        const lifeMatch = html.match(/Life Expectancy[^<]*?(\d+)\s*[-–—]\s*(\d+)/i)
            || html.match(/life_expectancy[^<]*?(\d+)\s*[-–—]\s*(\d+)/i);
        if (!lifeMatch) return null; // No life expectancy = skip

        const low = parseInt(lifeMatch[1], 10);
        const high = parseInt(lifeMatch[2], 10);

        // Extract breed group
        let breedGroup: string | null = null;
        const groupMatch = html.match(/Breed Group[^<]*?<[^>]*>([^<]+)</i)
            || html.match(/"breed_group"\s*:\s*"([^"]+)"/i);
        if (groupMatch) {
            breedGroup = groupMatch[1].trim();
        }

        // Extract breed name from og:breed meta or title
        let breedName = slugToName(slug);
        const ogBreed = html.match(/<meta[^>]*name="og:breed"[^>]*content="([^"]+)"/i);
        if (ogBreed) breedName = ogBreed[1];
        const titleMatch = html.match(/<title>([^|<]+)/);
        if (titleMatch && titleMatch[1].includes('Dog Breed')) {
            breedName = titleMatch[1].replace(/\s*[-–|].*/, '').trim();
        }

        return {
            name: breedName,
            species: 'DOG',
            breedGroup,
            lifeExpectancyLow: low,
            lifeExpectancyHigh: high,
            temperament: null,
            healthRiskScore: null,
            commonConditions: [],
            seniorAgeThreshold: deriveSeniorThreshold(high, 'DOG'),
            careNotes: null,
            sourceApi: 'akc',
        };
    };

    // Step 2: Scrape each breed page (batched)
    const results: BreedProfileData[] = [];
    const BATCH_SIZE = 5;
    const DELAY_MS = 300;

    for (let i = 0; i < breedSlugs.length; i += BATCH_SIZE) {
        const batch = breedSlugs.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (slug) => {
            try {
                const url = `https://www.akc.org/dog-breeds/${slug}/`;
                const resp = await fetch(url, { headers });
                if (!resp.ok) return null;

                const html = await resp.text();

                // Try JSON-LD first
                const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
                for (const block of ldMatches) {
                    const jsonStr = block
                        .replace(/<script type="application\/ld\+json">/, '')
                        .replace(/<\/script>/, '');
                    const profile = parseAkcJsonLd(jsonStr, slug);
                    if (profile && profile.lifeExpectancyLow !== null) {
                        return profile;
                    }
                }

                // Fallback: parse from HTML
                return parseAkcHtml(html, slug);
            } catch {
                return null;
            }
        });

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
            if (r) results.push(r);
        }

        if (i + BATCH_SIZE < breedSlugs.length) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }

        // Progress log every 50
        if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= breedSlugs.length) {
            const progress = Math.min(i + BATCH_SIZE, breedSlugs.length);
            console.log(`   🏆 AKC: ${progress}/${breedSlugs.length} pages scraped (${results.length} parsed)`);
        }
    }

    console.log(`   🏆 AKC: ${results.length} breeds with life expectancy data`);
    return results;
}

/**
 * Fetch all breeds from all configured APIs.
 * AKC data enriches TheDogAPI records (same breed name = merge).
 */
export async function fetchAllBreeds(): Promise<BreedProfileData[]> {
    const allBreeds: BreedProfileData[] = [];

    // TheDogAPI
    try {
        const dogs = await fetchDogBreeds();
        allBreeds.push(...dogs);
    } catch (err) {
        console.error(`   ❌ TheDogAPI: ${(err as Error).message}`);
    }

    // TheCatAPI
    try {
        const cats = await fetchCatBreeds();
        allBreeds.push(...cats);
    } catch (err) {
        console.error(`   ❌ TheCatAPI: ${(err as Error).message}`);
    }

    // AKC (enriches/adds dog breeds)
    try {
        const akcBreeds = await fetchAkcBreeds();
        const existingDogNames = new Set(allBreeds.filter(b => b.species === 'DOG').map(b => b.name.toLowerCase()));

        let merged = 0;
        let added = 0;
        for (const akc of akcBreeds) {
            const existing = allBreeds.find(
                b => b.species === 'DOG' && b.name.toLowerCase() === akc.name.toLowerCase()
            );
            if (existing) {
                // Enrich existing: prefer AKC for breed group & life expectancy
                if (akc.breedGroup) existing.breedGroup = akc.breedGroup;
                if (akc.lifeExpectancyLow !== null) existing.lifeExpectancyLow = akc.lifeExpectancyLow;
                if (akc.lifeExpectancyHigh !== null) {
                    existing.lifeExpectancyHigh = akc.lifeExpectancyHigh;
                    existing.seniorAgeThreshold = deriveSeniorThreshold(akc.lifeExpectancyHigh, 'DOG');
                }
                existing.sourceApi = `${existing.sourceApi}+akc`;
                merged++;
            } else if (!existingDogNames.has(akc.name.toLowerCase())) {
                allBreeds.push(akc);
                existingDogNames.add(akc.name.toLowerCase());
                added++;
            }
        }
        console.log(`   🏆 AKC: ${merged} breeds enriched, ${added} new breeds added`);
    } catch (err) {
        console.error(`   ❌ AKC: ${(err as Error).message}`);
    }

    return allBreeds;
}
