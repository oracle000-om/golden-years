/* eslint-disable @typescript-eslint/no-explicit-any */

// Type definitions matching our Prisma schema
// (Needed because Prisma 7 constructor typing loses inference with `as any` cast)

export interface Shelter {
    id: string;
    name: string;
    county: string;
    state: string;
    address: string | null;
    phone: string | null;
    websiteUrl: string | null;
    facebookUrl: string | null;
    trustScore: number | null;
    totalIntakeYtd: number;
    totalEuthanizedYtd: number;
    lastScrapedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    animals?: Animal[];
}

export interface Animal {
    id: string;
    shelterId: string;
    intakeId: string | null;
    name: string | null;
    species: 'DOG' | 'CAT' | 'OTHER';
    breed: string | null;
    sex: 'MALE' | 'FEMALE' | 'UNKNOWN' | null;
    size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null;
    photoUrl: string | null;
    status: 'LISTED' | 'URGENT' | 'PULLED' | 'ADOPTED' | 'EUTHANIZED' | 'UNKNOWN';
    ageKnownYears: number | null;
    ageEstimatedLow: number | null;
    ageEstimatedHigh: number | null;
    ageConfidenceScore: number | null;
    ageSource: 'SHELTER_REPORTED' | 'CV_ESTIMATED' | 'UNKNOWN';
    notes: string | null;
    intakeDate: Date | null;
    euthScheduledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    shelter?: Shelter;
    sources?: Source[];
}

export interface Source {
    id: string;
    animalId: string;
    sourceType: 'SHELTER_WEBSITE' | 'FACEBOOK_CROSSPOST' | 'MANUAL_ENTRY' | 'OTHER';
    sourceUrl: string;
    scrapedAt: Date;
}

export interface AnimalWithShelter extends Animal {
    shelter: Shelter;
}

export interface AnimalWithShelterAndSources extends Animal {
    shelter: Shelter;
    sources: Source[];
}

export interface ShelterWithAnimals extends Shelter {
    animals: Animal[];
}
