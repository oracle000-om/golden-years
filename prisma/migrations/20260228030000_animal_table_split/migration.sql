-- CreateTable: animal_assessments (CV pipeline data)
CREATE TABLE "animal_assessments" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "age_estimated_low" INTEGER,
    "age_estimated_high" INTEGER,
    "age_confidence" "AgeConfidence" NOT NULL DEFAULT 'NONE',
    "age_indicators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detected_breeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "breed_confidence" "AgeConfidence" NOT NULL DEFAULT 'NONE',
    "life_expectancy_low" INTEGER,
    "life_expectancy_high" INTEGER,
    "body_condition_score" INTEGER,
    "coat_condition" TEXT,
    "visible_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "health_notes" TEXT,
    "aggression_risk" INTEGER,
    "fear_indicators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stress_level" TEXT,
    "behavior_notes" TEXT,
    "photo_quality" TEXT,
    "likely_care_needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_care_level" TEXT,
    "data_conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dental_grade" INTEGER,
    "tartar_severity" TEXT,
    "dental_notes" TEXT,
    "cataract_stage" TEXT,
    "eye_notes" TEXT,
    "estimated_weight_lbs" INTEGER,
    "mobility_assessment" TEXT,
    "mobility_notes" TEXT,
    "energy_level" TEXT,
    "grooming_needs" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: animal_enrichments (computed/derived scores)
CREATE TABLE "animal_enrichments" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "adoption_urgency" TEXT,
    "adoption_readiness" TEXT,
    "breed_health_risk" INTEGER,
    "breed_common_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_annual_cost" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: animal_listings (rich listing detail from shelter APIs)
CREATE TABLE "animal_listings" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "house_trained" BOOLEAN,
    "good_with_cats" BOOLEAN,
    "good_with_dogs" BOOLEAN,
    "good_with_children" BOOLEAN,
    "special_needs" BOOLEAN,
    "description" TEXT,
    "environment_needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coat_type" TEXT,
    "coat_colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coat_pattern" TEXT,
    "is_mixed" BOOLEAN,
    "is_altered" BOOLEAN,
    "is_microchipped" BOOLEAN,
    "is_vaccinated" BOOLEAN,
    "adoption_fee" TEXT,
    "listing_url" TEXT,
    "is_courtesy_listing" BOOLEAN,
    "weight" TEXT,
    "birthday" TIMESTAMP(3),
    "is_foster_home" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "animal_assessments_animal_id_key" ON "animal_assessments"("animal_id");
CREATE UNIQUE INDEX "animal_enrichments_animal_id_key" ON "animal_enrichments"("animal_id");
CREATE UNIQUE INDEX "animal_listings_animal_id_key" ON "animal_listings"("animal_id");

-- AddForeignKey
ALTER TABLE "animal_assessments" ADD CONSTRAINT "animal_assessments_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animal_enrichments" ADD CONSTRAINT "animal_enrichments_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animal_listings" ADD CONSTRAINT "animal_listings_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data: assessments (only for animals that have CV data)
INSERT INTO "animal_assessments" ("id", "animal_id",
    "age_estimated_low", "age_estimated_high", "age_confidence", "age_indicators",
    "detected_breeds", "breed_confidence", "life_expectancy_low", "life_expectancy_high",
    "body_condition_score", "coat_condition", "visible_conditions", "health_notes",
    "aggression_risk", "fear_indicators", "stress_level", "behavior_notes",
    "photo_quality", "likely_care_needs", "estimated_care_level", "data_conflicts",
    "dental_grade", "tartar_severity", "dental_notes", "cataract_stage", "eye_notes",
    "estimated_weight_lbs", "mobility_assessment", "mobility_notes", "energy_level", "grooming_needs",
    "created_at", "updated_at")
SELECT gen_random_uuid(), "id",
    "age_estimated_low", "age_estimated_high", "age_confidence", "age_indicators",
    "detected_breeds", "breed_confidence", "life_expectancy_low", "life_expectancy_high",
    "body_condition_score", "coat_condition", "visible_conditions", "health_notes",
    "aggression_risk", "fear_indicators", "stress_level", "behavior_notes",
    "photo_quality", "likely_care_needs", "estimated_care_level", "data_conflicts",
    "dental_grade", "tartar_severity", "dental_notes", "cataract_stage", "eye_notes",
    "estimated_weight_lbs", "mobility_assessment", "mobility_notes", "energy_level", "grooming_needs",
    "created_at", "updated_at"
FROM "animals"
WHERE "age_estimated_low" IS NOT NULL
   OR "body_condition_score" IS NOT NULL
   OR "dental_grade" IS NOT NULL
   OR array_length("detected_breeds", 1) > 0;

-- Migrate existing data: enrichments (only for animals that have computed scores)
INSERT INTO "animal_enrichments" ("id", "animal_id",
    "adoption_urgency", "adoption_readiness",
    "breed_health_risk", "breed_common_conditions", "estimated_annual_cost",
    "created_at", "updated_at")
SELECT gen_random_uuid(), "id",
    "adoption_urgency", "adoption_readiness",
    "breed_health_risk", "breed_common_conditions", "estimated_annual_cost",
    "created_at", "updated_at"
FROM "animals"
WHERE "adoption_urgency" IS NOT NULL
   OR "adoption_readiness" IS NOT NULL
   OR "breed_health_risk" IS NOT NULL
   OR "estimated_annual_cost" IS NOT NULL;

-- Migrate existing data: listings (only for animals that have listing detail)
INSERT INTO "animal_listings" ("id", "animal_id",
    "house_trained", "good_with_cats", "good_with_dogs", "good_with_children", "special_needs",
    "description", "environment_needs",
    "coat_type", "coat_colors", "coat_pattern", "is_mixed",
    "is_altered", "is_microchipped", "is_vaccinated",
    "adoption_fee", "listing_url", "is_courtesy_listing",
    "weight", "birthday", "is_foster_home",
    "created_at", "updated_at")
SELECT gen_random_uuid(), "id",
    "house_trained", "good_with_cats", "good_with_dogs", "good_with_children", "special_needs",
    "description", "environment_needs",
    "coat_type", "coat_colors", "coat_pattern", "is_mixed",
    "is_altered", "is_microchipped", "is_vaccinated",
    "adoption_fee", "listing_url", "is_courtesy_listing",
    "weight", "birthday", "is_foster_home",
    "created_at", "updated_at"
FROM "animals"
WHERE "description" IS NOT NULL
   OR "house_trained" IS NOT NULL
   OR "good_with_cats" IS NOT NULL
   OR "good_with_dogs" IS NOT NULL
   OR "is_altered" IS NOT NULL
   OR "adoption_fee" IS NOT NULL
   OR "listing_url" IS NOT NULL
   OR "weight" IS NOT NULL;
