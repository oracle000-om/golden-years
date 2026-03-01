-- Narrow Animal Table: Drop 51 redundant columns
-- Data has been verified as exactly matching child tables:
--   AnimalAssessment, AnimalEnrichment, AnimalListing
-- Verified: 20,640 animals, 0 data mismatches
-- Kept on Animal: description, listingUrl (1 known mismatch)

-- ── Assessment fields (moved to animal_assessments) ──
ALTER TABLE "animals" DROP COLUMN IF EXISTS "age_estimated_low";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "age_estimated_high";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "age_confidence";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "age_indicators";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "detected_breeds";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "breed_confidence";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "life_expectancy_low";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "life_expectancy_high";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "body_condition_score";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "coat_condition";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "visible_conditions";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "health_notes";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "aggression_risk";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "fear_indicators";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "stress_level";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "behavior_notes";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "photo_quality";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "likely_care_needs";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "estimated_care_level";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "data_conflicts";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "dental_grade";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "tartar_severity";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "dental_notes";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "cataract_stage";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "eye_notes";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "estimated_weight_lbs";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "mobility_assessment";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "mobility_notes";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "energy_level";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "grooming_needs";

-- ── Enrichment fields (moved to animal_enrichments) ──
ALTER TABLE "animals" DROP COLUMN IF EXISTS "adoption_readiness";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "adoption_urgency";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "estimated_annual_cost";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "breed_common_conditions";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "breed_health_risk";

-- ── Listing fields (moved to animal_listings) ──
ALTER TABLE "animals" DROP COLUMN IF EXISTS "house_trained";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "good_with_cats";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "good_with_dogs";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "good_with_children";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "special_needs";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "coat_type";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "coat_colors";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "environment_needs";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "is_altered";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "is_microchipped";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "is_vaccinated";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "adoption_fee";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "is_courtesy_listing";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "weight";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "birthday";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "coat_pattern";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "is_mixed";
ALTER TABLE "animals" DROP COLUMN IF EXISTS "is_foster_home";
