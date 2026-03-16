/**
 * Snapshot Deduplication — only create a snapshot when something changed.
 *
 * Compares the incoming snapshot data against the most recent snapshot
 * for that animal. If all tracked fields are identical, skip the insert.
 */

import type { PrismaClient } from '../../src/generated/prisma';
import type { AnimalStatus } from '../../src/generated/prisma';

/** The fields we compare to decide if a new snapshot is warranted. */
const COMPARE_FIELDS = [
    'status',
    'name',
    'photoUrl',
    'notes',
    'euthScheduledAt',
    'bodyConditionScore',
    'coatCondition',
    'aggressionRisk',
    'stressLevel',
    'photoQuality',
] as const;

interface SnapshotData {
    animalId: string;
    listingSource: string;
    status: AnimalStatus;
    name?: string | null;
    photoUrl?: string | null;
    notes?: string | null;
    euthScheduledAt?: Date | null;
    bodyConditionScore?: number | null;
    coatCondition?: string | null;
    aggressionRisk?: number | null;
    stressLevel?: string | null;
    photoQuality?: string | null;
    rawAssessment?: any;
    rawSourceData?: any;
}

/**
 * Creates a snapshot ONLY if something changed from the most recent one.
 * Returns true if a snapshot was created, false if skipped (no changes).
 */
export async function maybeCreateSnapshot(
    prisma: PrismaClient,
    data: SnapshotData,
): Promise<boolean> {
    // Fetch the most recent snapshot for this animal
    const latest = await prisma.animalSnapshot.findFirst({
        where: { animalId: data.animalId },
        orderBy: { scrapedAt: 'desc' },
        select: {
            status: true,
            name: true,
            photoUrl: true,
            notes: true,
            euthScheduledAt: true,
            bodyConditionScore: true,
            coatCondition: true,
            aggressionRisk: true,
            stressLevel: true,
            photoQuality: true,
        },
    });

    // First snapshot for this animal — always create
    if (!latest) {
        await prisma.animalSnapshot.create({ data });
        return true;
    }

    // Compare tracked fields
    const hasChanges = COMPARE_FIELDS.some(field => {
        const oldVal = (latest as any)[field];
        const newVal = (data as any)[field];

        // Normalize nulls/undefined
        const a = oldVal ?? null;
        const b = newVal ?? null;

        // Date comparison
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() !== b.getTime();
        }
        if (a instanceof Date || b instanceof Date) {
            // One is Date, other isn't
            const aTime = a instanceof Date ? a.getTime() : a ? new Date(a).getTime() : null;
            const bTime = b instanceof Date ? b.getTime() : b ? new Date(b).getTime() : null;
            return aTime !== bTime;
        }

        return a !== b;
    });

    if (hasChanges) {
        await prisma.animalSnapshot.create({ data });
        return true;
    }

    return false;
}
