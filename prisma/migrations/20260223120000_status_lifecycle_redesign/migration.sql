-- Status Lifecycle Redesign
-- Rename enum values: LISTED->AVAILABLE, PULLED->RESCUE_PULL, UNKNOWN->DELISTED
-- Add: TRANSFERRED, RETURNED_OWNER
-- Add lifecycle fields and indexes

-- PostgreSQL cannot rename or remove enum values in-place.
-- Strategy: create new enum type, swap columns, drop old type.

-- Step 1: Create the new enum type
CREATE TYPE "AnimalStatus_new" AS ENUM ('AVAILABLE', 'URGENT', 'RESCUE_PULL', 'ADOPTED', 'TRANSFERRED', 'RETURNED_OWNER', 'EUTHANIZED', 'DELISTED');

-- Step 2: Add a temporary column with the new type on animals table
ALTER TABLE "animals" ADD COLUMN "status_new" "AnimalStatus_new";

-- Step 3: Migrate data
UPDATE "animals" SET "status_new" = CASE
    WHEN "status"::text = 'LISTED' THEN 'AVAILABLE'::"AnimalStatus_new"
    WHEN "status"::text = 'PULLED' THEN 'RESCUE_PULL'::"AnimalStatus_new"
    WHEN "status"::text = 'UNKNOWN' THEN 'DELISTED'::"AnimalStatus_new"
    WHEN "status"::text = 'URGENT' THEN 'URGENT'::"AnimalStatus_new"
    WHEN "status"::text = 'ADOPTED' THEN 'ADOPTED'::"AnimalStatus_new"
    WHEN "status"::text = 'EUTHANIZED' THEN 'EUTHANIZED'::"AnimalStatus_new"
    ELSE 'AVAILABLE'::"AnimalStatus_new"
END;

-- Step 4: Drop old column, rename new one
ALTER TABLE "animals" DROP COLUMN "status";
ALTER TABLE "animals" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "animals" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "animals" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE'::"AnimalStatus_new";

-- Step 5: Same for animal_snapshots table
ALTER TABLE "animal_snapshots" ADD COLUMN "status_new" "AnimalStatus_new";
UPDATE "animal_snapshots" SET "status_new" = CASE
    WHEN "status"::text = 'LISTED' THEN 'AVAILABLE'::"AnimalStatus_new"
    WHEN "status"::text = 'PULLED' THEN 'RESCUE_PULL'::"AnimalStatus_new"
    WHEN "status"::text = 'UNKNOWN' THEN 'DELISTED'::"AnimalStatus_new"
    WHEN "status"::text = 'URGENT' THEN 'URGENT'::"AnimalStatus_new"
    WHEN "status"::text = 'ADOPTED' THEN 'ADOPTED'::"AnimalStatus_new"
    WHEN "status"::text = 'EUTHANIZED' THEN 'EUTHANIZED'::"AnimalStatus_new"
    ELSE 'AVAILABLE'::"AnimalStatus_new"
END;
ALTER TABLE "animal_snapshots" DROP COLUMN "status";
ALTER TABLE "animal_snapshots" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "animal_snapshots" ALTER COLUMN "status" SET NOT NULL;

-- Step 6: Drop the old enum, rename new one
DROP TYPE "AnimalStatus";
ALTER TYPE "AnimalStatus_new" RENAME TO "AnimalStatus";

-- Step 7: Add lifecycle fields
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "delisted_at" TIMESTAMP(3);
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "outcome_date" TIMESTAMP(3);
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "outcome_notes" TEXT;

-- Step 8: Add indexes for performance
CREATE INDEX IF NOT EXISTS "animals_shelter_id_status_idx" ON "animals"("shelter_id", "status");
CREATE INDEX IF NOT EXISTS "animals_status_idx" ON "animals"("status");
