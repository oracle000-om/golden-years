-- AlterTable
ALTER TABLE "animals" ADD COLUMN "photo_hash" TEXT;

-- CreateIndex
CREATE INDEX "animals_photo_hash_idx" ON "animals"("photo_hash");
