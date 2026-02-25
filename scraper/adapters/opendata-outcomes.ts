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
    animalid?: string;       // Riverside uses this
    id?: string;             // Sonoma uses this
    animal_type?: string;
    animaltype?: string;     // Riverside uses this
    breed?: string;
    animal_breed?: string;   // Dallas uses this
    color?: string;
    age_upon_outcome?: string;
    impound_age?: string;    // Riverside: age in days
    petage?: string;         // Montgomery: e.g. "3 YEARS"
    sex_upon_outcome?: string;
    sex?: string;            // Sonoma uses this
    outcome_type?: string;
    outcome_status?: string; // Austin datahub uses this
    outtype?: string;        // Montgomery uses this (EUTH, ADOPTION, etc.)
    dispositiontype?: string; // Riverside uses this (EUTH, TRANSFER, etc.)
    outcome_subtype?: string;
    outsubtype?: string;     // Montgomery uses this
    datetime?: string;
    outcome_date?: string;   // Dallas uses this instead of datetime
    outdate?: string;        // Montgomery uses this
    disposition_date?: string; // Riverside uses this
    date_of_birth?: string;
    name?: string;
    petname?: string;        // Montgomery uses this
    type?: string;
    outcome_condition?: string;
    intake_type?: string;    // Dallas includes this in same dataset
    intype?: string;         // Montgomery uses this
    intake_date?: string;    // Dallas includes this in same dataset
    indate?: string;         // Montgomery uses this
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
    // Handle age in days (Riverside: impound_age is in days)
    const numOnly = ageStr.trim();
    if (/^\d+$/.test(numOnly)) {
        const days = parseInt(numOnly, 10);
        if (days > 365) return Math.round(days / 365);
        return null; // Less than 1 year — not senior
    }
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
 * Detect which date field this dataset uses by trying datetime first, then outcome_date, then disposition_date.
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
    // Try 'disposition_date' (Riverside-style)
    try {
        const url = buildSodaUrl(domain, resourceId, {
            '$select': 'disposition_date',
            '$limit': '1',
        });
        await fetchSoda(url);
        return 'disposition_date';
    } catch {
        // Fall through
    }
    // Try 'outdate' (Montgomery-style)
    try {
        const url = buildSodaUrl(domain, resourceId, {
            '$select': 'outdate',
            '$limit': '1',
        });
        await fetchSoda(url);
        return 'outdate';
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
    // Riverside uses dispositiontype: EUTH
    // Montgomery uses outtype: EUTH
    // Austin datahub uses outcome_status: Euthanasia
    const euthOutcomes = allOutcomes.filter(o => {
        const outcomeType = (o.outcome_type || o.outcome_status || o.outtype || o.dispositiontype || '').toLowerCase();
        return outcomeType.startsWith('euth');
    });
    console.log(`   🔴 ${euthOutcomes.length} euthanasia outcomes`);

    // ── Map euthanasia outcomes to ScrapedAnimal ──
    const shelterId = `opendata-${config.id}`;
    const outcomes: ScrapedAnimal[] = euthOutcomes
        .filter(o => o.animal_id || o.animalid || o.id) // Must have an ID
        .map(o => {
            const outcomeDate = o.datetime || o.outcome_date || o.outdate || o.disposition_date;
            const breed = o.breed || o.animal_breed;
            const animalId = o.animal_id || o.animalid || o.id!;
            const outcomeSubtype = o.outcome_subtype || o.outsubtype;
            return {
                intakeId: animalId,
                name: o.name || o.petname || null,
                species: mapSpecies(o.animal_type || o.animaltype || o.type),
                breed: breed || null,
                sex: mapSex(o.sex_upon_outcome || o.sex),
                size: null,
                photoUrl: null, // Open data doesn't include photos
                status: 'URGENT' as const,
                ageKnownYears: parseAgeToYears(o.age_upon_outcome || o.petage || o.impound_age),
                ageSource: 'SHELTER_REPORTED' as const,
                euthScheduledAt: outcomeDate ? new Date(outcomeDate) : null,
                intakeDate: (o.intake_date || o.indate) ? new Date((o.intake_date || o.indate)!) : null,
                notes: outcomeSubtype
                    ? `Euthanasia reason: ${outcomeSubtype}`
                    : null,
                intakeReason: 'UNKNOWN' as const,
                intakeReasonDetail: outcomeSubtype || null,
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
