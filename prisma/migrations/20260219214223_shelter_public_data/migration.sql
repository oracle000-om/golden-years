/*
  Warnings:

  - You are about to drop the column `total_euthanized_ytd` on the `shelters` table. All the data in the column will be lost.
  - You are about to drop the column `total_intake_ytd` on the `shelters` table. All the data in the column will be lost.
  - You are about to drop the column `trust_score` on the `shelters` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "shelters" DROP COLUMN "total_euthanized_ytd",
DROP COLUMN "total_intake_ytd",
DROP COLUMN "trust_score",
ADD COLUMN     "data_source_name" TEXT,
ADD COLUMN     "data_source_url" TEXT,
ADD COLUMN     "data_year" INTEGER,
ADD COLUMN     "total_euthanized_annual" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_intake_annual" INTEGER NOT NULL DEFAULT 0;
