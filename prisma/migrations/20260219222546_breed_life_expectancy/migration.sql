-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "breed_confidence" "AgeConfidence" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "detected_breeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "life_expectancy_high" INTEGER,
ADD COLUMN     "life_expectancy_low" INTEGER;
