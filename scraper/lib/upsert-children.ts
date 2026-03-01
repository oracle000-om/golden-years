/**
 * Upsert Animal Child Tables — Shared helper for all scraper runners.
 *
 * After upserting the core Animal record, call this to dual-write
 * assessment, enrichment, and listing data to the child tables.
 *
 * During the transition period, data is written to BOTH the old
 * columns on Animal AND the new child tables. This will be removed
 * in Phase 5 when old columns are dropped.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaAny = any;

/** Fields that belong in AnimalAssessment (CV pipeline) */
const ASSESSMENT_FIELDS = [
    'ageEstimatedLow', 'ageEstimatedHigh', 'ageConfidence', 'ageIndicators',
    'detectedBreeds', 'breedConfidence', 'lifeExpectancyLow', 'lifeExpectancyHigh',
    'bodyConditionScore', 'coatCondition', 'visibleConditions', 'healthNotes',
    'aggressionRisk', 'fearIndicators', 'stressLevel', 'behaviorNotes',
    'photoQuality', 'likelyCareNeeds', 'estimatedCareLevel', 'dataConflicts',
    'dentalGrade', 'tartarSeverity', 'dentalNotes', 'cataractStage', 'eyeNotes',
    'estimatedWeightLbs', 'mobilityAssessment', 'mobilityNotes', 'energyLevel', 'groomingNeeds',
] as const;

/** Fields that belong in AnimalEnrichment (computed scores) */
const ENRICHMENT_FIELDS = [
    'adoptionUrgency', 'adoptionReadiness',
    'breedHealthRisk', 'breedCommonConditions', 'estimatedAnnualCost',
] as const;

/** Fields that belong in AnimalListing (rich listing detail) */
const LISTING_FIELDS = [
    'houseTrained', 'goodWithCats', 'goodWithDogs', 'goodWithChildren', 'specialNeeds',
    'description', 'environmentNeeds',
    'coatType', 'coatColors', 'coatPattern', 'isMixed',
    'isAltered', 'isMicrochipped', 'isVaccinated',
    'adoptionFee', 'listingUrl', 'isCourtesyListing',
    'weight', 'birthday', 'isFosterHome',
] as const;

/**
 * Extract a subset of fields from a data object.
 * Returns null if no fields have non-undefined values.
 */
function extractFields(data: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};
    let hasData = false;
    for (const field of fields) {
        if (field in data && data[field] !== undefined) {
            result[field] = data[field];
            hasData = true;
        }
    }
    return hasData ? result : null;
}

/**
 * After upserting an Animal, upsert its child table rows.
 *
 * @param prisma - Prisma client (cast to any for untyped access)
 * @param animalId - The animal record ID
 * @param data - The flat data object containing all fields
 */
export async function upsertAnimalChildren(
    prisma: PrismaAny,
    animalId: string,
    data: Record<string, unknown>,
): Promise<void> {
    const assessmentData = extractFields(data, ASSESSMENT_FIELDS);
    const enrichmentData = extractFields(data, ENRICHMENT_FIELDS);
    const listingData = extractFields(data, LISTING_FIELDS);

    const operations: Promise<unknown>[] = [];

    if (assessmentData) {
        operations.push(
            prisma.animalAssessment.upsert({
                where: { animalId },
                update: assessmentData,
                create: { animalId, ...assessmentData },
            }),
        );
    }

    if (enrichmentData) {
        operations.push(
            prisma.animalEnrichment.upsert({
                where: { animalId },
                update: enrichmentData,
                create: { animalId, ...enrichmentData },
            }),
        );
    }

    if (listingData) {
        operations.push(
            prisma.animalListing.upsert({
                where: { animalId },
                update: listingData,
                create: { animalId, ...listingData },
            }),
        );
    }

    if (operations.length > 0) {
        await Promise.all(operations);
    }
}

export { ASSESSMENT_FIELDS, ENRICHMENT_FIELDS, LISTING_FIELDS, extractFields };

/**
 * Strip child-table fields from a data object so it can be safely
 * passed to prisma.animal.create/update without referencing dropped columns.
 *
 * Note: 'description' and 'listingUrl' exist on BOTH Animal and AnimalListing,
 * so they are NOT stripped.
 */
const FIELDS_ON_BOTH = new Set(['description', 'listingUrl']);
const CHILD_FIELD_SET = new Set<string>(
    [...ASSESSMENT_FIELDS, ...ENRICHMENT_FIELDS, ...LISTING_FIELDS]
        .filter(f => !FIELDS_ON_BOTH.has(f)),
);

export function stripChildFields(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (!CHILD_FIELD_SET.has(key)) {
            result[key] = value;
        }
    }
    return result;
}
