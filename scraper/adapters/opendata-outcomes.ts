/**
 * Open Data Shelter Outcomes — Socrata SODA Adapter
 *
 * Fetches shelter outcome data from cities that publish via Socrata.
 * Config-driven: add new cities to scraper/config/opendata-config.json.
 *
 * API: Socrata SODA — https://{domain}/resource/{resourceId}.json
 * Auth: None for public datasets (app token optional for higher rate limits)
 *
 * Primary use: euthanasia outcome tracking + shelter-level stats.
 */

import type { ScrapedAnimal } from '../types';
import { readFileSync } from 'fs';
import { join } from 'path';

interface OpenDataConfig {
    id: string;
    shelterName: string;
    city: string;
    state: string;
    domain: string;
    outcomesResourceId: string;
    intakesResourceId: string | null;
    notes?: string;
}

interface SocrataOutcome {
    animal_id?: string;
    id?: string;             // Sonoma uses this
    animal_type?: string;
    breed?: string;
    animal_breed?: string;   // Dallas uses this
    color?: string;
    age_upon_outcome?: string;
    sex_upon_outcome?: string;
    sex?: string;            // Sonoma uses this
    outcome_type?: string;
    outcome_subtype?: string;
    datetime?: string;
    outcome_date?: string;   // Dallas uses this instead of datetime
    date_of_birth?: string;
    name?: string;
    type?: string;
    outcome_condition?: string;
    intake_type?: string;    // Dallas includes this in same dataset
    intake_date?: string;    // Dallas includes this in same dataset
}

interface SocrataIntake {
    animal_id?: string;
    animal_type?: string;
    intake_type?: string;
    intake_condition?: string;
    datetime?: string;
}

export interface ShelterStats {
    shelterId: string;
    shelterName: string;
    city: string;
    state: string;
    totalOutcomes: number;
    totalEuthanasia: number;
    totalIntakes: number;
    liveReleaseRate: number | null;
    periodDays: number;
}

export interface OpenDataResult {
    euthanasiaOutcomes: ScrapedAnimal[];
    shelterStats: ShelterStats[];
}

function loadConfig(): OpenDataConfig[] {
    const configPath = join(__dirname, '..', 'config', 'opendata-config.json');
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as OpenDataConfig[];
}

function parseAgeToYears(ageStr: string | undefined): number | null {
    if (!ageStr) return null;
    const yearMatch = ageStr.match(/(\d+)\s*year/i);
    if (yearMatch) return parseInt(yearMatch[1], 10);
    const monthMatch = ageStr.match(/(\d+)\s*month/i);
    if (monthMatch) return Math.floor(parseInt(monthMatch[1], 10) / 12);
    return null;
}

function mapSpecies(type: string | undefined): 'DOG' | 'CAT' | 'OTHER' {
    if (!type) return 'OTHER';
    const t = type.toLowerCase();
    if (t === 'dog') return 'DOG';
    if (t === 'cat') return 'CAT';
    return 'OTHER';
}

function mapSex(sex: string | undefined): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    if (!sex) return 'UNKNOWN';
    const s = sex.toLowerCase();
    if (s.includes('male') && !s.includes('female')) return 'MALE';
    if (s.includes('female')) return 'FEMALE';
    return 'UNKNOWN';
}

/**
 * Build a SoQL query URL.
 * SoQL docs: https://dev.socrata.com/docs/queries/
 */
function buildSodaUrl(
    domain: string,
    resourceId: string,
    params: Record<string, string>,
): string {
    const base = `https://${domain}/resource/${resourceId}.json`;
    const qs = new URLSearchParams(params).toString();
    return `${base}?${qs}`;
}

/**
 * Fetch data from a Socrata SODA endpoint.
 */
async function fetchSoda<T>(url: string): Promise<T[]> {
    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'GoldenYearsClub/1.0 (shelter-data)',
        },
    });

    if (!response.ok) {
        throw new Error(`SODA API ${response.status}: ${response.statusText}`);
    }

    return await response.json() as T[];
}

/**
 * Detect which date field this dataset uses by trying datetime first, then outcome_date.
 */
async function detectDateField(domain: string, resourceId: string): Promise<string> {
    // Try 'datetime' first (Austin-style)
    try {
        const url = buildSodaUrl(domain, resourceId, {
            '$select': 'datetime',
            '$limit': '1',
        });
        await fetchSoda(url);
        return 'datetime';
    } catch {
        // Fall through
    }
    // Try 'outcome_date' (Dallas-style)
    try {
        const url = buildSodaUrl(domain, resourceId, {
            '$select': 'outcome_date',
            '$limit': '1',
        });
        await fetchSoda(url);
        return 'outcome_date';
    } catch {
        // Fall through
    }
    return 'datetime'; // default
}

/**
 * Fetch euthanasia outcomes from a single city's open data portal.
 */
async function fetchCityOutcomes(config: OpenDataConfig, daysPast: number = 90): Promise<{
    outcomes: ScrapedAnimal[];
    stats: ShelterStats;
}> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysPast);
    const sinceDateStr = sinceDate.toISOString().split('.')[0]; // e.g., "2025-01-01T00:00:00"

    // Detect which date field this dataset uses
    const dateField = await detectDateField(config.domain, config.outcomesResourceId);
    console.log(`   📡 Fetching outcomes from ${config.shelterName} (date field: ${dateField})...`);

    // ── Fetch outcomes ──
    const outcomesUrl = buildSodaUrl(config.domain, config.outcomesResourceId, {
        '$where': `${dateField} > '${sinceDateStr}'`,
        '$order': `${dateField} DESC`,
        '$limit': '5000',
    });

    const allOutcomes = await fetchSoda<SocrataOutcome>(outcomesUrl);
    console.log(`   ${allOutcomes.length} total outcomes in past ${daysPast} days`);

    // ── Filter euthanasia outcomes ──
    // Cities use different spellings: euthanasia (Austin), euthanized (Dallas), euthanize (Sonoma)
    const euthOutcomes = allOutcomes.filter(o => {
        const outcomeType = o.outcome_type?.toLowerCase() || '';
        return outcomeType.startsWith('euthan');
    });
    console.log(`   🔴 ${euthOutcomes.length} euthanasia outcomes`);

    // ── Map euthanasia outcomes to ScrapedAnimal ──
    const shelterId = `opendata-${config.id}`;
    const outcomes: ScrapedAnimal[] = euthOutcomes
        .filter(o => o.animal_id || o.id) // Must have an ID
        .map(o => {
            const outcomeDate = o.datetime || o.outcome_date;
            const breed = o.breed || o.animal_breed;
            const animalId = o.animal_id || o.id!;
            return {
                intakeId: animalId,
                name: o.name || null,
                species: mapSpecies(o.animal_type || o.type),
                breed: breed || null,
                sex: mapSex(o.sex_upon_outcome || o.sex),
                size: null,
                photoUrl: null, // Open data doesn't include photos
                status: 'URGENT' as const,
                ageKnownYears: parseAgeToYears(o.age_upon_outcome),
                ageSource: 'SHELTER_REPORTED' as const,
                euthScheduledAt: outcomeDate ? new Date(outcomeDate) : null,
                intakeDate: o.intake_date ? new Date(o.intake_date) : null,
                notes: o.outcome_subtype
                    ? `Euthanasia reason: ${o.outcome_subtype}`
                    : null,
                intakeReason: 'UNKNOWN' as const,
                intakeReasonDetail: o.outcome_subtype || null,
                _shelterId: shelterId,
                _shelterName: config.shelterName,
                _shelterCity: config.city,
                _shelterState: config.state,
            };
        });

    // ── Fetch intakes for stats (if available) ──
    let totalIntakes = 0;
    if (config.intakesResourceId) {
        try {
            const intakesUrl = buildSodaUrl(config.domain, config.intakesResourceId, {
                '$where': `datetime > '${sinceDateStr}'`,
                '$select': 'count(*) as total',
            });
            const intakeData = await fetchSoda<{ total: string }>(intakesUrl);
            totalIntakes = intakeData[0] ? parseInt(intakeData[0].total, 10) : 0;
            console.log(`   📥 ${totalIntakes} total intakes`);
        } catch (err) {
            console.warn(`   ⚠ Could not fetch intakes: ${(err as Error).message}`);
        }
    }

    // ── Compute stats ──
    const totalOutcomes = allOutcomes.length;
    const totalEuthanasia = euthOutcomes.length;
    const liveReleaseRate = totalOutcomes > 0
        ? Math.round(((totalOutcomes - totalEuthanasia) / totalOutcomes) * 1000) / 10
        : null;

    return {
        outcomes,
        stats: {
            shelterId,
            shelterName: config.shelterName,
            city: config.city,
            state: config.state,
            totalOutcomes,
            totalEuthanasia,
            totalIntakes,
            liveReleaseRate,
            periodDays: daysPast,
        },
    };
}

/**
 * Fetch outcomes from all configured cities.
 */
export async function scrapeOpenData(opts?: {
    cityIds?: string[];
    daysPast?: number;
}): Promise<OpenDataResult> {
    const allConfigs = loadConfig();
    const configs = opts?.cityIds
        ? allConfigs.filter(c => opts.cityIds!.includes(c.id))
        : allConfigs;

    const allOutcomes: ScrapedAnimal[] = [];
    const allStats: ShelterStats[] = [];

    for (const config of configs) {
        try {
            const { outcomes, stats } = await fetchCityOutcomes(config, opts?.daysPast ?? 90);
            allOutcomes.push(...outcomes);
            allStats.push(stats);
        } catch (err) {
            console.error(`   ❌ ${config.shelterName}: ${(err as Error).message}`);
        }

        // Rate limit between cities
        await new Promise(r => setTimeout(r, 500));
    }

    return { euthanasiaOutcomes: allOutcomes, shelterStats: allStats };
}
