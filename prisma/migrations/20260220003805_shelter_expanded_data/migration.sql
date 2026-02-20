-- AlterTable
ALTER TABLE "shelters" ADD COLUMN     "county_population" INTEGER,
ADD COLUMN     "prior_data_year" INTEGER,
ADD COLUMN     "prior_year_euthanized" INTEGER,
ADD COLUMN     "prior_year_intake" INTEGER,
ADD COLUMN     "total_returned_to_owner" INTEGER,
ADD COLUMN     "total_transferred" INTEGER;
