// Type definitions matching our Prisma schema
// (Needed because Prisma 7 constructor typing loses inference with `as any` cast)

export interface Shelter {
    id: string;
    name: string;
    county: string;
    state: string;
    shelterType: 'MUNICIPAL' | 'RESCUE' | 'NO_KILL' | 'FOSTER_BASED' | 'SANCTUARY';
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
    photoHash: string | null;
    photoUrls: string[];
    videoUrl: string | null;
    status: 'AVAILABLE' | 'URGENT' | 'STALE' | 'RESCUE_PULL' | 'ADOPTED' | 'TRANSFERRED' | 'RETURNED_OWNER' | 'EUTHANIZED' | 'DELISTED';
    ageKnownYears: number | null;
    ageSource: 'SHELTER_REPORTED' | 'CV_ESTIMATED' | 'UNKNOWN';
    ageSegment: string;
    description: string | null;
    listingUrl: string | null;
    intakeReason: 'OWNER_SURRENDER' | 'STRAY' | 'OWNER_DECEASED' | 'CONFISCATE' | 'RETURN' | 'TRANSFER' | 'INJURED' | 'OTHER' | 'UNKNOWN';
    intakeReasonDetail: string | null;
    notes: string | null;
    intakeDate: Date | null;
    euthScheduledAt: Date | null;
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
    daysInShelter: number | null;
    delistedAt: Date | null;
    shelterEntryCount: number;
    consecutiveMisses: number;
    staleSince: Date | null;
    outcomeDate: Date | null;
    outcomeNotes: string | null;
    identityId: string | null;
    createdAt: Date;
    updatedAt: Date;
    shelter?: Shelter;
    sources?: Source[];
    // Child table relations (optional, present when included)
    assessment?: AnimalAssessment | null;
    enrichment?: AnimalEnrichment | null;
    listing?: AnimalListing | null;
}

export interface AnimalAssessment {
    id: string;
    animalId: string;
    ageEstimatedLow: number | null;
    ageEstimatedHigh: number | null;
    ageConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    ageIndicators: string[];
    detectedBreeds: string[];
    breedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    lifeExpectancyLow: number | null;
    lifeExpectancyHigh: number | null;
    bodyConditionScore: number | null;
    coatCondition: string | null;
    visibleConditions: string[];
    healthNotes: string | null;
    aggressionRisk: number | null;
    fearIndicators: string[];
    stressLevel: string | null;
    behaviorNotes: string | null;
    photoQuality: string | null;
    likelyCareNeeds: string[];
    estimatedCareLevel: string | null;
    dataConflicts: string[];
    dentalGrade: number | null;
    tartarSeverity: string | null;
    dentalNotes: string | null;
    cataractStage: string | null;
    eyeNotes: string | null;
    estimatedWeightLbs: number | null;
    mobilityAssessment: string | null;
    mobilityNotes: string | null;
    energyLevel: string | null;
    groomingNeeds: string | null;
}

export interface AnimalEnrichment {
    id: string;
    animalId: string;
    adoptionUrgency: string | null;
    adoptionReadiness: string | null;
    breedHealthRisk: number | null;
    breedCommonConditions: string[];
    estimatedAnnualCost: string | null;
}

export interface AnimalListing {
    id: string;
    animalId: string;
    houseTrained: boolean | null;
    goodWithCats: boolean | null;
    goodWithDogs: boolean | null;
    goodWithChildren: boolean | null;
    specialNeeds: boolean | null;
    description: string | null;
    environmentNeeds: string[];
    coatType: string | null;
    coatColors: string[];
    coatPattern: string | null;
    isMixed: boolean | null;
    isAltered: boolean | null;
    isMicrochipped: boolean | null;
    isVaccinated: boolean | null;
    adoptionFee: string | null;
    listingUrl: string | null;
    isCourtesyListing: boolean | null;
    weight: string | null;
    birthday: Date | null;
    isFosterHome: boolean | null;
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
