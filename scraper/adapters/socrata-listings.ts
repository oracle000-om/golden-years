/**
 * Socrata Listings Adapter — Active Animal Inventory
 *
 * Some Socrata portals publish real-time shelter inventory (animals
 * currently available for adoption). This adapter fetches those
 * listings and normalizes them into ScrapedAnimal records.
 *
 * Currently supported:
 *   - King County (Seattle) — Lost/Found/Adoptable with PetHarbor photos
 *   - Dallas — Active animal inventory
 */

import type { ScrapedAnimal } from '../types';
import { safeFetchJSON, isSenior, mapSex, mapSpecies, mapSize, parseAge } from './base-adapter';

// ── Config ─────────────────────────────────────────────

interface SocrataListingConfig {
    id: string;
    shelterName: string;
    city: string;
    state: string;
    domain: string;
    resourceId: string;
    /** SoQL filter for adoptable animals (applied as $where) */
    adoptableFilter?: string;
    /** Field mappings */
    fields: {
        animalId: string;
        name: string;
        species: string;
        breed: string;
        sex: string;
        age: string;
        /** Optional: field containing image URL or object with 'url' property */
        image?: string;
        /** Optional: record type field to filter by */
        recordType?: string;
    };
}

const LISTING_CONFIGS: SocrataListingConfig[] = [
    {
        id: 'king-county-wa',
        shelterName: 'Regional Animal Services of King County',
        city: 'Seattle',
        state: 'WA',
        domain: 'data.kingcounty.gov',
        resourceId: 'yaai-7frk',
        adoptableFilter: "record_type='ADOPTABLE'",
        fields: {
            animalId: 'animal_id',
            name: 'animal_name',
            species: 'animal_type',
            breed: 'animal_breed',
            sex: 'animal_gender',
            age: 'age',
            image: 'image',
            recordType: 'record_type',
        },
    },
    {
        id: 'dallas-tx-inventory',
        shelterName: 'Dallas Animal Services (Inventory)',
        city: 'Dallas',
        state: 'TX',
        domain: 'www.dallasopendata.com',
        resourceId: 'qgg6-h4bd',
        fields: {
            animalId: 'animal_id',
            name: 'animal_name',
            species: 'animal_type',
            breed: 'animal_breed',
            sex: 'sex',
            age: 'age',
        },
    },
];

// ── Fetcher ────────────────────────────────────────────

async function fetchSocrataListings(config: SocrataListingConfig): Promise<ScrapedAnimal[]> {
    const limit = 5000;
    let where = config.adoptableFilter || '';

    const url = `https://${config.domain}/resource/${config.resourceId}.json?$limit=${limit}${where ? `&$where=${encodeURIComponent(where)}` : ''}`;

    console.log(`   🔍 ${config.shelterName}: Fetching from ${config.domain}...`);

    let records: Record<string, unknown>[];
    try {
        records = await safeFetchJSON<Record<string, unknown>[]>(url, {
            retries: 3,
            timeoutMs: 30_000,
        });
    } catch (err) {
        console.error(`   ❌ ${config.shelterName}: ${(err as Error).message?.substring(0, 100)}`);
        return [];
    }

    console.log(`      Raw records: ${records.length}`);

    const animals: ScrapedAnimal[] = [];
    const { fields } = config;

    for (const r of records) {
        const species = mapSpecies(String(r[fields.species] || ''));

        // Parse age — handle formats like "Over 1 year<p/>", "3 YEARS", "5 years 2 months"
        let ageStr = String(r[fields.age] || '');
        ageStr = ageStr.replace(/<[^>]+>/g, '').trim(); // Strip HTML tags
        const ageYears = parseAge(ageStr);

        if (!isSenior(ageYears, species)) continue;

        const id = String(r[fields.animalId] || '');
        if (!id) continue;

        // Extract photo URL — may be a string or an object with 'url' property
        let photoUrl: string | null = null;
        if (fields.image) {
            const imgField = r[fields.image];
            if (typeof imgField === 'string') {
                photoUrl = imgField;
            } else if (imgField && typeof imgField === 'object' && 'url' in (imgField as Record<string, unknown>)) {
                photoUrl = String((imgField as Record<string, string>).url);
            }
        }

        const name = r[fields.name] ? String(r[fields.name]).trim() : null;
        const breed = r[fields.breed] ? String(r[fields.breed]).trim() : null;
        const sex = mapSex(r[fields.sex] ? String(r[fields.sex]) : '');

        animals.push({
            intakeId: `SOC-${config.id}-${id}`,
            name,
            species,
            breed,
            sex,
            size: null,
            photoUrl,
            status: 'AVAILABLE',
            ageKnownYears: ageYears,
            ageSource: ageYears !== null ? 'SHELTER_REPORTED' : 'UNKNOWN',
            euthScheduledAt: null,
            intakeDate: null,
            notes: null,
            intakeReason: 'UNKNOWN',
            intakeReasonDetail: null,
            _shelterId: `socrata-${config.id}`,
            _shelterName: config.shelterName,
            _shelterCity: config.city,
            _shelterState: config.state,
        });
    }

    console.log(`      Seniors with data: ${animals.length} (${animals.filter(a => a.photoUrl).length} with photos)`);
    return animals;
}

// ── Public API ─────────────────────────────────────────

export async function scrapeSocrataListings(opts?: {
    shelterIds?: string[];
}): Promise<{ animals: ScrapedAnimal[]; configs: SocrataListingConfig[] }> {
    const configs = opts?.shelterIds
        ? LISTING_CONFIGS.filter(c => opts.shelterIds!.includes(c.id))
        : LISTING_CONFIGS;

    const allAnimals: ScrapedAnimal[] = [];
    for (const config of configs) {
        const animals = await fetchSocrataListings(config);
        allAnimals.push(...animals);
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`   Total Socrata listings: ${allAnimals.length} seniors from ${configs.length} portals`);
    return { animals: allAnimals, configs };
}

export { LISTING_CONFIGS };
