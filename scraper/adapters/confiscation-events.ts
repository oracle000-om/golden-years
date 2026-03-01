/**
 * Confiscation Events Adapter
 *
 * Tracks large-scale animal seizures from cruelty, hoarding,
 * and fighting cases. No centralized database exists, so this
 * adapter combines:
 *
 * 1. Animal Legal Defense Fund (ALDF) case database
 * 2. Curated seed data from news reports
 *
 * Events with 10+ animals seized are tracked.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const ALDF_CASES_URL = 'https://aldf.org/cases/';

export interface ConfiscationEventRecord {
    state: string;
    county: string | null;
    date: Date;
    animalCount: number;
    species: string[];           // ['DOG', 'CAT', etc.]
    chargeType: string | null;   // HOARDING, CRUELTY, NEGLECT, FIGHTING
    narrative: string | null;
    sourceUrl: string | null;
}

interface SeedEvent {
    state: string;
    county?: string;
    date: string;           // ISO date
    animal_count: number;
    species?: string[];
    charge_type?: string;
    narrative?: string;
    source_url?: string;
}

/**
 * Load confiscation events from a curated JSON seed file.
 */
async function loadSeedEvents(): Promise<ConfiscationEventRecord[]> {
    const filePath = join(__dirname, '..', '..', 'data', 'confiscation-events.json');

    try {
        const raw = await readFile(filePath, 'utf-8');
        const seeds: SeedEvent[] = JSON.parse(raw);

        return seeds
            .filter(s => s.state && s.date && s.animal_count >= 10)
            .map(s => ({
                state: s.state.trim().toUpperCase(),
                county: s.county?.trim() || null,
                date: new Date(s.date),
                animalCount: s.animal_count,
                species: (s.species || ['DOG']).map(sp => sp.toUpperCase()),
                chargeType: s.charge_type?.toUpperCase() || null,
                narrative: s.narrative?.trim() || null,
                sourceUrl: s.source_url?.trim() || null,
            }));
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`   ℹ️  No seed file found at ${filePath}`);
            return [];
        }
        throw err;
    }
}

/**
 * Attempt to scrape ALDF's case listing for animal cases.
 * This is a best-effort scrape — the page structure may change.
 */
async function fetchALDFCases(): Promise<ConfiscationEventRecord[]> {
    console.log(`   📥 Checking ALDF case database...`);

    try {
        const resp = await fetch(ALDF_CASES_URL, {
            headers: { 'User-Agent': 'GoldenYearsClub/1.0 (confiscation-tracking)' },
            signal: AbortSignal.timeout(30_000),
        });

        if (!resp.ok) {
            console.log(`   ⚠️  ALDF returned ${resp.status}, skipping web scrape`);
            return [];
        }

        const html = await resp.text();
        const events: ConfiscationEventRecord[] = [];

        // Look for case articles with animal counts
        const caseMatches = html.matchAll(
            /class="case[^"]*"[\s\S]*?<h[23][^>]*>([\s\S]*?)<\/h[23]>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi
        );

        for (const match of caseMatches) {
            const title = match[1].replace(/<[^>]+>/g, '').trim();
            const body = match[2].replace(/<[^>]+>/g, '').trim();

            // Extract animal count from text
            const countMatch = body.match(/(\d+)\s+(?:animals?|dogs?|cats?|pets?)/i);
            if (!countMatch) continue;
            const count = parseInt(countMatch[1], 10);
            if (count < 10) continue;

            // Extract state from title or body
            const stateMatch = (title + ' ' + body).match(
                /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/
            );

            // Classify charge type
            const lower = (title + ' ' + body).toLowerCase();
            let chargeType: string | null = null;
            if (lower.includes('hoard')) chargeType = 'HOARDING';
            else if (lower.includes('fight')) chargeType = 'FIGHTING';
            else if (lower.includes('neglect')) chargeType = 'NEGLECT';
            else if (lower.includes('cruel')) chargeType = 'CRUELTY';

            events.push({
                state: stateMatch?.[1] || 'US',
                county: null,
                date: new Date(),
                animalCount: count,
                species: lower.includes('cat') ? ['DOG', 'CAT'] : ['DOG'],
                chargeType,
                narrative: `${title}: ${body}`.substring(0, 500),
                sourceUrl: ALDF_CASES_URL,
            });
        }

        console.log(`   ✅ ${events.length} confiscation events found from ALDF`);
        return events;
    } catch (err: any) {
        console.log(`   ❌ ALDF scrape failed: ${err.message?.substring(0, 100)}`);
        return [];
    }
}

/**
 * Fetch all confiscation events from available sources.
 */
export async function fetchConfiscationEvents(): Promise<ConfiscationEventRecord[]> {
    console.log(`   🔍 Loading confiscation event data...`);

    const [seedEvents, aldfEvents] = await Promise.all([
        loadSeedEvents(),
        fetchALDFCases(),
    ]);

    const events = [...seedEvents, ...aldfEvents];
    console.log(`   ✅ ${events.length} total confiscation events (${seedEvents.length} seed + ${aldfEvents.length} ALDF)`);
    return events;
}
