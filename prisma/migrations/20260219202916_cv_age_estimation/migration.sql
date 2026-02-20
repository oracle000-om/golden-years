-- CreateEnum
CREATE TYPE "Species" AS ENUM ('DOG', 'CAT', 'OTHER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnimalSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'XLARGE');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('LISTED', 'URGENT', 'PULLED', 'ADOPTED', 'EUTHANIZED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AgeSource" AS ENUM ('SHELTER_REPORTED', 'CV_ESTIMATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AgeConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "IntakeReason" AS ENUM ('OWNER_SURRENDER', 'STRAY', 'OWNER_DECEASED', 'CONFISCATE', 'RETURN', 'TRANSFER', 'INJURED', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('SHELTER_WEBSITE', 'FACEBOOK_CROSSPOST', 'MANUAL_ENTRY', 'OTHER');

-- CreateTable
CREATE TABLE "shelters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website_url" TEXT,
    "facebook_url" TEXT,
    "trust_score" DOUBLE PRECISION,
    "total_intake_ytd" INTEGER NOT NULL DEFAULT 0,
    "total_euthanized_ytd" INTEGER NOT NULL DEFAULT 0,
    "last_scraped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shelters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" TEXT NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "intake_id" TEXT,
    "name" TEXT,
    "species" "Species" NOT NULL DEFAULT 'DOG',
    "breed" TEXT,
    "sex" "Sex",
    "size" "AnimalSize",
    "photo_url" TEXT,
    "status" "AnimalStatus" NOT NULL DEFAULT 'LISTED',
    "age_known_years" INTEGER,
    "age_estimated_low" INTEGER,
    "age_estimated_high" INTEGER,
    "age_confidence" "AgeConfidence" NOT NULL DEFAULT 'NONE',
    "age_indicators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age_source" "AgeSource" NOT NULL DEFAULT 'UNKNOWN',
    "intake_reason" "IntakeReason" NOT NULL DEFAULT 'UNKNOWN',
    "intake_reason_detail" TEXT,
    "notes" TEXT,
    "intake_date" TIMESTAMP(3),
    "euth_scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_url" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
