// Type definitions matching our Prisma schema
// (Needed because Prisma 7 constructor typing loses inference with `as any` cast)

export interface Shelter {
    id: string;
    name: string;
    county: string;
    state: string;
    shelterType: 'MUNICIPAL' | 'RESCUE' | 'NO_KILL' | 'FOSTER_BASED';
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
    latitude: number | null;
    longitude: number | null;
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
    photoUrls: string[];
    videoUrl: string | null;
    status: 'AVAILABLE' | 'URGENT' | 'STALE' | 'RESCUE_PULL' | 'ADOPTED' | 'TRANSFERRED' | 'RETURNED_OWNER' | 'EUTHANIZED' | 'DELISTED';
    lastSeenAt: Date | null;
    delistedAt: Date | null;
    shelterEntryCount: number;
    outcomeDate: Date | null;
    outcomeNotes: string | null;
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
    aggressionRisk: number | null;
    likelyCareNeeds: string[];
    estimatedCareLevel: string | null;
    dentalGrade: number | null;
    tartarSeverity: string | null;
    dentalNotes: string | null;
    cataractStage: string | null;
    eyeNotes: string | null;
    // v8: Physical assessment from CV
    estimatedWeightLbs: number | null;
    mobilityAssessment: string | null;
    mobilityNotes: string | null;
    energyLevel: string | null;
    groomingNeeds: string | null;
    goodWithChildren: boolean | null;
    goodWithDogs: boolean | null;
    goodWithCats: boolean | null;
    photoQuality: string | null;

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

export interface ShelterFinancials {
    id: string;
    shelterId: string;
    ein: string | null;
    nteeCode: string | null;
    taxPeriod: number | null;
    totalRevenue: number | null;
    totalExpenses: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    netAssets: number | null;
    contributions: number | null;
    programRevenue: number | null;
    fundraisingExpense: number | null;
    officerCompensation: number | null;
    filingHistory: unknown;
    proPublicaUrl: string | null;
}

export interface ShelterWithAnimals extends Shelter {
    animals: Animal[];
    financials?: ShelterFinancials | null;
}

export interface StatePolicy {
    holdingPeriodDays: number | null;
    spayNeuterRequired: boolean | null;
    mandatoryReporting: boolean | null;
    reportingBody: string | null;
}
