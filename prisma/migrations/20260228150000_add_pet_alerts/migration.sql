-- CreateEnum PetAlertType (idempotent)
DO $$ BEGIN
    CREATE TYPE "PetAlertType" AS ENUM ('LOST', 'FOUND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum PetAlertStatus (idempotent)
DO $$ BEGIN
    CREATE TYPE "PetAlertStatus" AS ENUM ('ACTIVE', 'MATCHED', 'EXPIRED', 'DEACTIVATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable pet_alerts
CREATE TABLE IF NOT EXISTS "pet_alerts" (
    "id" TEXT NOT NULL,
    "type" "PetAlertType" NOT NULL,
    "status" "PetAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "species" "Species" NOT NULL DEFAULT 'DOG',
    "breed" TEXT,
    "name" TEXT,
    "description" TEXT,
    "photo_url" TEXT,
    "photo_embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embedding_model" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_text" TEXT,
    "radius_miles" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_name" TEXT,
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "pet_alerts_status_species_idx" ON "pet_alerts"("status", "species");
CREATE INDEX IF NOT EXISTS "pet_alerts_expires_at_idx" ON "pet_alerts"("expires_at");
