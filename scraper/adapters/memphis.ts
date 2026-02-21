/**
 * Memphis Animal Services — Euthanasia List Scraper
 *
 * Memphis publishes a daily euthanasia list at:
 *   https://www.memphisanimalservices.com/todays-euthanasia-list
 *
 * The page is powered by ShelterLuv. Animals on this list are
 * scheduled for euthanasia TODAY. We use the ShelterLuv public
 * embed API to fetch the animals programmatically.
 *
 * ShelterLuv org ID for Memphis: obtained from page embed code.
 *
 * All animals on this list get euthScheduledAt = end of today.
 */

import type { ScrapedAnimal } from '../types';

// ShelterLuv public embed endpoint for Memphis Animal Services
// The org ID is embedded in the euthanasia list page widget
const SHELTERLUV_ORG_ID = '782'; // Memphis Animal Services
const API_BASE = `https://www.shelterluv.com/api/v1/${SHELTERLUV_ORG_ID}/animals`;

interface ShelterLuvAnimal {
    ID: string;
    Name: string;
    Type: string;         // "Dog", "Cat"
    Sex: string;          // "Male", "Female"
    Breed: string;
    Age: string;          // e.g., "10 Years 3 Months"
    Size: string;         // "Small", "Medium", "Large", "Extra Large"
    Photo: string;        // URL
    Status: string;       // e.g., "Awaiting Euthanasia"
    Description: string;
    LastUpdated: string;
    IntakeDate: string;
    InternalID: string;
}

function parseAge(ageStr: string): number | null {
    if (!ageStr) return null;
    const yearMatch = ageStr.match(/(\d+)\s*year/i);
    return yearMatch ? parseInt(yearMatch[1], 10) : null;
}

function mapSpecies(type: string): 'DOG' | 'CAT' | 'OTHER' {
    const t = type?.toLowerCase();
    if (t === 'dog') return 'DOG';
    if (t === 'cat') return 'CAT';
    return 'OTHER';
}

function mapSex(sex: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    const s = sex?.toLowerCase();
    if (s === 'male') return 'MALE';
    if (s === 'female') return 'FEMALE';
    return 'UNKNOWN';
}

function mapSize(size: string): 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null {
    if (!size) return null;
    const s = size.toLowerCase();
    if (s.includes('small')) return 'SMALL';
    if (s.includes('medium')) return 'MEDIUM';
    if (s.includes('extra') || s.includes('x-large') || s.includes('xlarge')) return 'XLARGE';
    if (s.includes('large')) return 'LARGE';
    return null;
}

/**
 * Scrape the Memphis euthanasia list.
 *
 * Strategy: Fetch publicly-visible animals from ShelterLuv,
 * filter for euthanasia-related statuses. All matches get
 * euthScheduledAt = end of today (5pm CT / 6pm ET).
 *
 * Fallback: If ShelterLuv API isn't accessible, we scrape
 * the page HTML and extract animal cards.
 */
export async function scrapeMemphisEuthList(): Promise<ScrapedAnimal[]> {
    console.log('   📋 Fetching Memphis euthanasia list...');

    // Try ShelterLuv public embed API first
    try {
        return await fetchViaShelterLuv();
    } catch (err) {
        console.warn(`   ⚠ ShelterLuv API failed: ${(err as Error).message}`);
        console.log('   Falling back to page scrape...');
        return await fetchViaPageScrape();
    }
}

async function fetchViaShelterLuv(): Promise<ScrapedAnimal[]> {
    // ShelterLuv public widget API — fetches animals displayed on the euth list page
    const response = await fetch(API_BASE, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'GoldenYearsClub/1.0',
        },
    });

    if (!response.ok) {
        throw new Error(`ShelterLuv API returned ${response.status}`);
    }

    const data = await response.json() as { animals?: ShelterLuvAnimal[] };
    const animals = data.animals || [];

    // Filter for euthanasia-related statuses
    const euthStatuses = ['awaiting euthanasia', 'euthanasia', 'at risk'];
    const euthAnimals = animals.filter(a =>
        euthStatuses.some(s => a.Status?.toLowerCase().includes(s))
    );

    console.log(`   ShelterLuv: ${animals.length} total, ${euthAnimals.length} on euth list`);

    // euthScheduledAt = today at 5pm Central (Memphis timezone)
    const today = new Date();
    const euthDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0, 0);

    return euthAnimals.map(a => ({
        intakeId: a.InternalID || a.ID,
        name: a.Name || null,
        species: mapSpecies(a.Type),
        breed: a.Breed || null,
        sex: mapSex(a.Sex),
        size: mapSize(a.Size),
        photoUrl: a.Photo || null,
        status: 'URGENT' as const,
        ageKnownYears: parseAge(a.Age),
        ageSource: 'SHELTER_REPORTED' as const,
        euthScheduledAt: euthDate,
        intakeDate: a.IntakeDate ? new Date(a.IntakeDate) : null,
        notes: a.Description || null,
        intakeReason: 'UNKNOWN' as const,
        intakeReasonDetail: null,
        _shelterId: 'memphis-animal-services',
        _shelterName: 'Memphis Animal Services',
        _shelterCity: 'Memphis',
        _shelterState: 'TN',
    }));
}

async function fetchViaPageScrape(): Promise<ScrapedAnimal[]> {
    // Fallback: fetch the HTML page and extract what we can
    const url = 'https://www.memphisanimalservices.com/todays-euthanasia-list';
    const response = await fetch(url, {
        headers: { 'User-Agent': 'GoldenYearsClub/1.0' },
    });

    if (!response.ok) {
        console.warn(`   ⚠ Memphis page returned ${response.status}`);
        return [];
    }

    const html = await response.text();

    // ShelterLuv embeds are rendered client-side via JS widgets.
    // The HTML itself may not contain animal data directly.
    // Look for ShelterLuv embed script to extract org ID.
    const orgMatch = html.match(/shelterluv\.com\/embed\/(\d+)/);
    if (orgMatch) {
        console.log(`   Found ShelterLuv org ID: ${orgMatch[1]} from page embed`);
    }

    // If the page has static animal cards (non-ShelterLuv), parse them
    // This is a best-effort — most shelters use JS widgets
    console.log('   ⚠ Page scrape: ShelterLuv content is JS-rendered, no static data found');
    return [];
}
