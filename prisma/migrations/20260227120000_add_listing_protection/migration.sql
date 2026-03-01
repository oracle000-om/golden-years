-- Add listing protection fields for ultra-conservative reconciliation
-- Animals now require 5+ consecutive scraper misses AND 14+ days unseen
-- before transitioning to STALE, and 30+ days in STALE before auto-delisting.

-- Step 1: Add STALE to the AnimalStatus enum
ALTER TYPE "AnimalStatus" ADD VALUE IF NOT EXISTS 'STALE';

-- Step 2: Add consecutive_misses counter
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "consecutive_misses" INTEGER NOT NULL DEFAULT 0;

-- Step 3: Add stale_since timestamp (when animal entered STALE status)
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "stale_since" TIMESTAMP(3);

-- Step 4: Index for efficient stale/reconciliation queries
CREATE INDEX IF NOT EXISTS "animals_consecutive_misses_idx" ON "animals"("consecutive_misses") WHERE "consecutive_misses" > 0;
CREATE INDEX IF NOT EXISTS "animals_stale_since_idx" ON "animals"("stale_since") WHERE "stale_since" IS NOT NULL;
