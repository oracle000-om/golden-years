/**
 * OC Animal Care — Scraper Adapter
 *
 * Uses the OC Pet Info JSON API to fetch adoptable animals.
 * Photos served via getImage.php endpoint.
 *
 * API: https://petadoption.ocpetinfo.com/Adopt/Service/adoptlist.php?type=DOG|CAT
 * Photos: https://petadoption.ocpetinfo.com/Adopt/Service/getImage.php?id={ID}&type=PET&num=1
 */

import type { ScrapedAnimal } from '../types';
import { isSenior } from './base-adapter';

const API_BASE = 'https://petadoption.ocpetinfo.com/Adopt/Service/adoptlist.php';
const PHOTO_BASE = 'https://petadoption.ocpetinfo.com/Adopt/img/servicethumb.php';

interface OCAnimal {
    animal_id: string;
    animal_name?: string;
    breed?: string;
    sex?: string;       // S=spayed female, N=neutered male, F=female, M=male
    years_old?: number;
    weight?: string;
    lcomment_complete?: string; // bio
    intake_type?: string;
}

function mapSex(sex?: string): 'MALE' | 'FEMALE' | 'UNKNOWN' {
    if (!sex) return 'UNKNOWN';
    const s = sex.toUpperCase();
    if (s === 'N' || s === 'M') return 'MALE';
    if (s === 'S' || s === 'F') return 'FEMALE';
    return 'UNKNOWN';
}

function mapIntakeReason(type?: string): { reason: ScrapedAnimal['intakeReason']; detail: string | null } {
    if (!type) return { reason: 'UNKNOWN', detail: null };
    const t = type.toLowerCase();
    if (t.includes('owner') || t.includes('surrender')) return { reason: 'OWNER_SURRENDER', detail: null };
    if (t.includes('stray')) return { reason: 'STRAY', detail: null };
    if (t.includes('return')) return { reason: 'RETURN', detail: null };
    if (t.includes('confiscat') || t.includes('seize')) return { reason: 'CONFISCATE', detail: null };
    if (t.includes('transfer')) return { reason: 'TRANSFER', detail: null };
    return { reason: 'UNKNOWN', detail: type };
}

export async function scrapeOcAnimalCare(): Promise<ScrapedAnimal[]> {
    const allAnimals: ScrapedAnimal[] = [];

    for (const type of ['DOG', 'CAT']) {
        console.log(`   Fetching OC ${type.toLowerCase()}s...`);
        const response = await fetch(`${API_BASE}?type=${type}`);
        if (!response.ok) throw new Error(`OC API ${response.status}`);

        const data = await response.json();
        const animals: OCAnimal[] = data.animals || data || [];

        for (const raw of animals) {
            const age = raw.years_old ?? null;
            const species: 'DOG' | 'CAT' | 'OTHER' = type === 'DOG' ? 'DOG' : 'CAT';
            if (!isSenior(age, species)) continue;

            // Photo via servicethumb.php
            const photoUrl = `${PHOTO_BASE}?tab=adopt&detailid=${raw.animal_id}`;
            const intake = mapIntakeReason(raw.intake_type);

            allAnimals.push({
                intakeId: raw.animal_id,
                name: raw.animal_name?.trim() || null,
                species: type === 'DOG' ? 'DOG' : 'CAT',
                breed: raw.breed || null,
                sex: mapSex(raw.sex),
                size: null,
                photoUrl,
                status: 'AVAILABLE',
                ageKnownYears: age,
                ageSource: 'SHELTER_REPORTED',
                euthScheduledAt: null,
                intakeDate: null,
                notes: raw.lcomment_complete || null,
                intakeReason: intake.reason,
                intakeReasonDetail: intake.detail,
            });
        }
    }

    console.log(`   Total seniors with photos: ${allAnimals.length}`);
    return allAnimals;
}
