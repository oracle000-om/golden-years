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

    /** Listing status */
    status: 'LISTED' | 'URGENT';

    /** Known age in years, if reported */
    ageKnownYears: number | null;

    /** Age source */
    ageSource: 'SHELTER_REPORTED' | 'CV_ESTIMATED' | 'UNKNOWN';

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
