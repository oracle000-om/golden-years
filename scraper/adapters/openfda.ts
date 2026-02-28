/**
 * openFDA Animal Drug Adverse Events Adapter
 *
 * Queries the openFDA API for breed-specific drug adverse event data.
 * Returns top reactions and top drugs with adverse events for a given breed.
 *
 * API: https://api.fda.gov/animalandveterinary/event.json
 * No API key required. Rate limit: ~240 req/min.
 * Data: 1987–2026, updated quarterly. 1.32M+ records.
 */

const BASE_URL = 'https://api.fda.gov/animalandveterinary/event.json';
const DELAY_MS = 300; // respectful rate limiting

// ── Breed name mapping: our BreedProfile name → FDA breed_component format ──
// FDA uses "Retriever - Labrador", "Shepherd Dog - German" etc.
const BREED_MAP: Record<string, string> = {
    // Dogs — common breeds
    'Labrador Retriever': 'Retriever - Labrador',
    'Golden Retriever': 'Retriever - Golden',
    'German Shepherd Dog': 'Shepherd Dog - German',
    'German Shepherd': 'Shepherd Dog - German',
    'Australian Shepherd': 'Shepherd Dog - Australian',
    'Yorkshire Terrier': 'Terrier - Yorkshire',
    'Jack Russell Terrier': 'Terrier - Jack Russell',
    'Border Collie': 'Collie - Border',
    'Rough Collie': 'Collie - Rough',
    'Smooth Collie': 'Collie - Smooth',
    'Boxer': 'Boxer (German Boxer)',
    'English Bulldog': 'Bulldog',
    'Bulldog': 'Bulldog',
    'French Bulldog': 'French Bulldog',
    'Cocker Spaniel': 'Spaniel - Cocker American',
    'English Cocker Spaniel': 'Spaniel - Cocker English',
    'Springer Spaniel': 'Spaniel - Springer English',
    'English Springer Spaniel': 'Spaniel - Springer English',
    'Cavalier King Charles Spaniel': 'Cavalier King Charles Spaniel',
    'Pembroke Welsh Corgi': 'Welsh Corgi - Pembroke',
    'Cardigan Welsh Corgi': 'Welsh Corgi - Cardigan',
    'Miniature Schnauzer': 'Schnauzer - Miniature',
    'Standard Schnauzer': 'Schnauzer - Standard',
    'Giant Schnauzer': 'Schnauzer - Giant',
    'Miniature Poodle': 'Poodle - Miniature',
    'Standard Poodle': 'Poodle - Standard',
    'Toy Poodle': 'Poodle - Toy',
    'Poodle': 'Poodle (unspecified)',
    'Shetland Sheepdog': 'Shetland Sheepdog',
    'Bull Terrier': 'Bull Terrier',
    'Staffordshire Bull Terrier': 'Staffordshire Bull Terrier',
    'American Staffordshire Terrier': 'American Staffordshire Terrier',
    'Pit Bull': 'Pit Bull',
    'Dachshund': 'Dachshund (unspecified)',
    'Miniature Dachshund': 'Dachshund - Miniature',
    'Standard Dachshund': 'Dachshund - Standard',
    // Simple 1:1 breeds (no transform needed)
    'Chihuahua': 'Chihuahua',
    'Pug': 'Pug',
    'Beagle': 'Beagle',
    'Rottweiler': 'Rottweiler',
    'Doberman Pinscher': 'Doberman Pinscher',
    'Maltese': 'Maltese',
    'Pomeranian': 'Pomeranian',
    'Shih Tzu': 'Shih Tzu',
    'Siberian Husky': 'Siberian Husky',
    'Great Dane': 'Great Dane',
    'Weimaraner': 'Weimaraner',
    'Vizsla': 'Vizsla',
    'Dalmatian': 'Dalmatian',
    'Akita': 'Akita',
    'Samoyed': 'Samoyed',
    'Havanese': 'Havanese',
    'Bichon Frise': 'Bichon Frise',
    'Basset Hound': 'Basset Hound',
    'Bloodhound': 'Bloodhound',
    'Newfoundland': 'Newfoundland',
    'Saint Bernard': 'Saint Bernard',
    'Bernese Mountain Dog': 'Bernese Mountain Dog',
    'Great Pyrenees': 'Great Pyrenees',
    'Irish Setter': 'Setter - Irish',
    'English Setter': 'Setter - English',
    'Gordon Setter': 'Setter - Gordon',
    'Cane Corso': 'Cane Corso',
    'Mastiff': 'Mastiff (unspecified)',
    'Bullmastiff': 'Bullmastiff',
    'Chow Chow': 'Chow Chow',
    'Irish Wolfhound': 'Wolfhound - Irish',
    'Belgian Malinois': 'Belgian Malinois',
    'Papillon': 'Papillon',
    'Lhasa Apso': 'Lhasa Apso',
    'Pekingese': 'Pekingese',
    'Boston Terrier': 'Boston Terrier',
    // Cats
    'Persian': 'Persian',
    'Siamese': 'Siamese',
    'Maine Coon': 'Maine Coon',
    'Ragdoll': 'Ragdoll',
    'Bengal': 'Bengal',
    'British Shorthair': 'British Shorthair',
    'Abyssinian': 'Abyssinian',
    'Sphynx': 'Sphynx',
    'Scottish Fold': 'Scottish Fold',
    'Burmese': 'Burmese',
    'Russian Blue': 'Russian Blue',
    'Domestic Shorthair': 'Domestic Shorthair',
    'Domestic Longhair': 'Domestic Longhair',
    'Domestic Medium Hair': 'Domestic Medium Hair',
};

import type { FdaAdverseReaction, FdaDrugWarning } from '../types/breed-health';
export type { FdaAdverseReaction, FdaDrugWarning } from '../types/breed-health';

export interface FdaBreedData {
    breed: string;
    fdaBreedTerm: string;
    eventCount: number;
    topReactions: FdaAdverseReaction[];
    topDrugs: FdaDrugWarning[];
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Map a BreedProfile name to the FDA breed_component term.
 * Cleans AKC/API-style suffixes first, then checks the mapping.
 */
export function mapBreedToFda(breedName: string): string | null {
    // Clean AKC-style suffixes from the breed DB
    const cleaned = breedName
        .replace(/\s*(Dog|Cat)\s*Breed\s*Information\s*/gi, '')
        .replace(/\s*(Dog|Cat)\s*Breed\s*/gi, '')
        .trim();

    // Exact match first
    if (BREED_MAP[cleaned]) return BREED_MAP[cleaned];

    // Case-insensitive match
    const lower = cleaned.toLowerCase();
    for (const [key, val] of Object.entries(BREED_MAP)) {
        if (key.toLowerCase() === lower) return val;
    }

    // Partial match: check if cleaned name starts with a known breed
    for (const [key, val] of Object.entries(BREED_MAP)) {
        if (lower.startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(lower)) {
            return val;
        }
    }

    // Try the cleaned name directly — FDA might have it
    return cleaned;
}

/**
 * Get the total count of adverse events for a breed.
 */
async function getEventCount(fdaBreedTerm: string, species: string): Promise<number> {
    const speciesSearch = species === 'DOG' ? 'Dog' : 'Cat';
    const url = `${BASE_URL}?search=animal.breed.breed_component:"${encodeURIComponent(fdaBreedTerm)}"+AND+animal.species:"${speciesSearch}"&limit=1`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return 0;
        const data = await resp.json();
        return data?.meta?.results?.total ?? 0;
    } catch {
        return 0;
    }
}

/**
 * Get top adverse reactions for a breed.
 */
async function getTopReactions(fdaBreedTerm: string, species: string, limit = 15): Promise<FdaAdverseReaction[]> {
    const speciesSearch = species === 'DOG' ? 'Dog' : 'Cat';
    const url = `${BASE_URL}?search=animal.breed.breed_component:"${encodeURIComponent(fdaBreedTerm)}"+AND+animal.species:"${speciesSearch}"&count=reaction.veddra_term_name.exact&limit=${limit}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data?.results ?? []).map((r: any) => ({
            reaction: r.term,
            count: r.count,
        }));
    } catch {
        return [];
    }
}

/**
 * Get top drugs involved in adverse events for a breed.
 */
async function getTopDrugs(fdaBreedTerm: string, species: string, limit = 15): Promise<FdaDrugWarning[]> {
    const speciesSearch = species === 'DOG' ? 'Dog' : 'Cat';
    const url = `${BASE_URL}?search=animal.breed.breed_component:"${encodeURIComponent(fdaBreedTerm)}"+AND+animal.species:"${speciesSearch}"&count=drug.active_ingredients.name.exact&limit=${limit}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return [];
        const data = await resp.json();
        return (data?.results ?? []).map((r: any) => ({
            drug: r.term,
            count: r.count,
        }));
    } catch {
        return [];
    }
}

/**
 * Fetch all FDA adverse event data for a breed.
 * Makes 3 API calls (count, reactions, drugs) with rate limiting.
 */
export async function fetchFdaBreedData(breedName: string, species: string): Promise<FdaBreedData | null> {
    const fdaTerm = mapBreedToFda(breedName);
    if (!fdaTerm) return null;

    const eventCount = await getEventCount(fdaTerm, species);
    await sleep(DELAY_MS);

    if (eventCount < 10) {
        // Skip breeds with negligible data
        return null;
    }

    const topReactions = await getTopReactions(fdaTerm, species);
    await sleep(DELAY_MS);

    const topDrugs = await getTopDrugs(fdaTerm, species);
    await sleep(DELAY_MS);

    return {
        breed: breedName,
        fdaBreedTerm: fdaTerm,
        eventCount,
        topReactions,
        topDrugs,
    };
}
