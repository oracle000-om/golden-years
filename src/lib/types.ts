// Type definitions matching our Prisma schema
// (Needed because Prisma 7 constructor typing loses inference with `as any` cast)

export interface Shelter {
    id: string;
    name: string;
    county: string;
    state: string;
    address: string | null;
    zipCode: string | null;
    phone: string | null;
    websiteUrl: string | null;
    facebookUrl: string | null;
    totalIntakeAnnual: number;
    totalEuthanizedAnnual: number;
    dataYear: number | null;
    dataSourceName: string | null;
    dataSourceUrl: string | null;
    countyPopulation: number | null;
    totalReturnedToOwner: number | null;
    totalTransferred: number | null;
    priorYearIntake: number | null;
    priorYearEuthanized: number | null;
    priorDataYear: number | null;
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
    ageConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    ageIndicators: string[];
    ageSource: 'SHELTER_REPORTED' | 'CV_ESTIMATED' | 'UNKNOWN';
    detectedBreeds: string[];
    breedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    lifeExpectancyLow: number | null;
    lifeExpectancyHigh: number | null;
    bodyConditionScore: number | null;
    coatCondition: string | null;
    visibleConditions: string[];
    healthNotes: string | null;
    stressLevel: string | null;
    fearIndicators: string[];
    likelyCareNeeds: string[];
    estimatedCareLevel: string | null;
    intakeReason: 'OWNER_SURRENDER' | 'STRAY' | 'OWNER_DECEASED' | 'CONFISCATE' | 'RETURN' | 'TRANSFER' | 'INJURED' | 'OTHER' | 'UNKNOWN';
    intakeReasonDetail: string | null;
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
