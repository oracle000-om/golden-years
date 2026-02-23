/**
 * LA County Animal Care — Scraper Adapter
 *
 * Uses the DACC WordPress REST API to fetch adoptable animals.
 * Photos served from Azure Blob Storage.
 *
 * API: https://animalcare.lacounty.gov/wp-json/wppro-acc/v1/get/animals
 * Photos: https://daccanimalimagesprod.blob.core.windows.net/images/{animalID}.jpg
 */

import type { ScrapedAnimal } from '../types';

const SEARCH_PAGE = 'https://animalcare.lacounty.gov/dacc-search/';
const API_URL = 'https://animalcare.lacounty.gov/wp-json/wppro-acc/v1/get/animals';
const PHOTO_BASE = 'https://daccanimalimagesprod.blob.core.windows.net/images';
const SENIOR_AGE = 7;

interface DACCAnimal {
    animalId: string;
    animalID?: string; // fallback
    animalName?: string;
    breed?: string;
    sex?: string;
    yearsOld?: number;
    monthsOld?: number;
    kennelStat?: string;
    imageCount?: number;
    animalType?: string;
    location?: string;
    animalSize?: string;
    primaryColor?: string;
    ownerSurrender?: string;
    rescueOnly?: string | null;
}

/** Fetch auth headers embedded in the DACC search page */
async function getAuthHeaders(): Promise<Record<string, string>> {
    const html = await (await fetch(SEARCH_PAGE)).text();
    const sigMatch = html.match(/signature\s*:\s*'([^']+)'/) || html.match(/signature\s*:\s*"([^"]+)"/);
    const tsMatch = html.match(/timestamp\s*:\s*'([^']+)'/) || html.match(/timestamp\s*:\s*"([^"]+)"/);

    if (!sigMatch || !tsMatch) throw new Error('Could not extract DACC auth headers');
    return {
        'X-AccSearch-Signature': sigMatch[1],
        'X-AccSearch-Timestamp': tsMatch[1],
    };
}

function mapSex(sex?: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    if (!sex) return 'UNKNOWN';
    const s = sex.toLowerCase();
    if (s.includes('male') && !s.includes('female')) return 'MALE';
    if (s.includes('female')) return 'FEMALE';
    return 'UNKNOWN';
}

function mapSpecies(type?: string): 'DOG' | 'CAT' | 'OTHER' {
    if (!type) return 'OTHER';
    const t = type.toUpperCase();
    if (t === 'DOG') return 'DOG';
    if (t === 'CAT') return 'CAT';
    return 'OTHER';
}

function mapIntakeReason(raw: DACCAnimal): { reason: ScrapedAnimal['intakeReason']; detail: string | null } {
    if (raw.ownerSurrender === 'Y') return { reason: 'OWNER_SURRENDER', detail: null };
    if (raw.kennelStat?.toLowerCase().includes('stray')) return { reason: 'STRAY', detail: null };
    if (raw.location) return { reason: 'STRAY', detail: raw.location };
    return { reason: 'UNKNOWN', detail: null };
}

export async function scrapeLaCounty(): Promise<ScrapedAnimal[]> {
    console.log('   Fetching DACC auth headers...');
    const headers = await getAuthHeaders();

    const allAnimals: ScrapedAnimal[] = [];
    const PAGE_SIZE = 25; // DACC max per page

    for (const animalType of ['dog', 'cat']) {
        console.log(`   Fetching ${animalType}s...`);
        let page = 1;
        let totalPages = 1;
        let fetched = 0;

        while (page <= totalPages) {
            const url = `${API_URL}?route=Animals&AnimalType=${animalType}&PageNumber=${page}&PageSize=${PAGE_SIZE}&SortType=0`;
            const response = await fetch(url, { headers });

            if (!response.ok) throw new Error(`DACC API ${response.status}`);
            const text = await response.text();
            if (!text || text.length < 10) break;

            let result: { animals?: DACCAnimal[]; totalPages?: number; totalRecords?: number };
            try {
                result = JSON.parse(text);
            } catch {
                break;
            }

            const data = result.animals || [];
            if (page === 1) {
                totalPages = result.totalPages || 1;
                console.log(`   ${animalType}s: ${result.totalRecords || 0} total, ${totalPages} pages`);
            }

            fetched += data.length;

            for (const raw of data) {
                const age = raw.yearsOld ?? null;
                const seniorAge = mapSpecies(raw.animalType) === 'CAT' ? 10 : 7;
                if (age === null || age < seniorAge) continue;

                // Photo required — skip if no images
                const hasPhoto = (raw.imageCount ?? 0) > 0;
                if (!hasPhoto) continue;

                const id = raw.animalId || raw.animalID || '';
                const photoUrl = `${PHOTO_BASE}/${id}.jpg`;
                const intake = mapIntakeReason(raw);

                allAnimals.push({
                    intakeId: id,
                    name: raw.animalName?.trim() || null,
                    species: mapSpecies(raw.animalType),
                    breed: raw.breed || null,
                    sex: mapSex(raw.sex),
                    size: null,
                    photoUrl,
                    status: 'AVAILABLE',
                    ageKnownYears: age,
                    ageSource: 'SHELTER_REPORTED',
                    euthScheduledAt: null,
                    intakeDate: null,
                    notes: raw.location ? `Location: ${raw.location}` : null,
                    intakeReason: intake.reason,
                    intakeReasonDetail: intake.detail,
                });
            }

            page++;
            if (page <= totalPages) {
                await new Promise(r => setTimeout(r, 250));
            }
        }

        console.log(`   ${animalType}s: ${fetched} fetched, ${allAnimals.length} seniors so far`);
    }

    console.log(`   Total seniors with photos: ${allAnimals.length}`);
    return allAnimals;
}
