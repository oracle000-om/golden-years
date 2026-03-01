/**
 * Scraper types — normalized animal data from any shelter source
 */

export interface ScrapedAnimal {
    /** Shelter's internal ID for this animal (e.g., "A5892387") */
    intakeId: string;

    /** Animal's name, if known */
    name: string | null;

    /** Species: DOG, CAT, or OTHER */
    species: 'DOG' | 'CAT' | 'OTHER';

    /** Breed description */
    breed: string | null;

    /** Sex: MALE, FEMALE, or UNKNOWN */
    sex: 'MALE' | 'FEMALE' | 'UNKNOWN';

    /** Size: SMALL, MEDIUM, LARGE, XLARGE */
    size: 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE' | null;

    /** URL to the animal's photo */
    photoUrl: string | null;

    /** Additional photo URLs beyond the primary */
    photoUrls?: string[];

    /** Video URL for behavioral analysis (from Petfinder _media) */
    videoUrl?: string | null;

    /** Listing status */
    status: 'AVAILABLE' | 'URGENT';

    /** Known age in years, if reported */
    ageKnownYears: number | null;

    /** Age source */
    ageSource: 'SHELTER_REPORTED' | 'CV_ESTIMATED' | 'UNKNOWN';

    /** Age segment for product segmentation (GYC=SENIOR, LBC=PUPPY/YOUNG) */
    ageSegment?: 'PUPPY' | 'YOUNG' | 'ADULT' | 'SENIOR' | 'UNKNOWN';

    /** Scheduled euthanasia date, if known */
    euthScheduledAt: Date | null;

    /** Intake date */
    intakeDate: Date | null;

    /** Notes / description */
    notes: string | null;

    /** Intake reason category */
    intakeReason: 'OWNER_SURRENDER' | 'STRAY' | 'OWNER_DECEASED' | 'CONFISCATE' | 'RETURN' | 'TRANSFER' | 'INJURED' | 'OTHER' | 'UNKNOWN';

    /** Free-text intake reason detail */
    intakeReasonDetail: string | null;

    // ── Behavioral data ──
    /** Is this animal house trained? */
    houseTrained?: boolean | null;
    /** Good with cats? */
    goodWithCats?: boolean | null;
    /** Good with dogs? */
    goodWithDogs?: boolean | null;
    /** Good with children? */
    goodWithChildren?: boolean | null;
    /** Has special needs? */
    specialNeeds?: boolean | null;

    // ── Coat & appearance ──
    /** Coat type (e.g., "Short", "Long", "Wire") */
    coatType?: string | null;
    /** Coat colors */
    coatColors?: string[];

    // ── Description & environment ──
    /** Full bio/description text from the listing */
    description?: string | null;
    /** Environment requirements (e.g., ["No cats", "Fenced yard"]) */
    environmentNeeds?: string[];

    // ── v7: Medical status ──
    /** Spayed/neutered */
    isAltered?: boolean | null;
    /** Has microchip */
    isMicrochipped?: boolean | null;
    /** Current on vaccinations */
    isVaccinated?: boolean | null;

    // ── v7: Adoption & listing ──
    /** Adoption fee (e.g., "$150", "Waived") */
    adoptionFee?: string | null;
    /** Direct URL to original listing */
    listingUrl?: string | null;
    /** Courtesy listing (not physically at this shelter) */
    isCourtesyListing?: boolean | null;

    // ── v7: Physical details ──
    /** Weight (e.g., "55 lbs") */
    weight?: string | null;
    /** Exact or estimated birthdate */
    birthday?: Date | null;
    /** Coat pattern (e.g., "Tabby", "Tuxedo", "Brindle") */
    coatPattern?: string | null;
    /** Mixed breed flag */
    isMixed?: boolean | null;

    // ── v7: Location / foster ──
    /** Currently in foster home */
    isFosterHome?: boolean | null;

    // ── Internal: shelter metadata (populated by aggregator adapters) ──
    /** Internal shelter ID from the data source */
    _shelterId?: string | null;
    /** Shelter display name */
    _shelterName?: string | null;
    /** Shelter city */
    _shelterCity?: string | null;
    /** Shelter state */
    _shelterState?: string | null;
}

export interface ShelterConfig {
    /** Unique identifier for this shelter */
    id: string;

    /** Display name */
    name: string;

    /** County */
    county: string;

    /** State */
    state: string;

    /** Address */
    address: string | null;

    /** Phone */
    phone: string | null;

    /** Website URL */
    websiteUrl: string | null;

    /** URL where animal listings are found */
    listingsUrl: string;

    /** Function that scrapes and returns normalized animals */
    adapter: () => Promise<ScrapedAnimal[]>;
}
