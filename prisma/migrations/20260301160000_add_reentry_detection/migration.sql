-- CreateTable
CREATE TABLE "animal_identities" (
    "id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "journey_json" JSONB,
    "is_re_entry" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "re_entry_candidates" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "matched_animal_id" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "re_entry_candidates_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "animals" ADD COLUMN "identity_id" TEXT;

-- CreateIndex
CREATE INDEX "re_entry_candidates_status_idx" ON "re_entry_candidates"("status");

-- CreateIndex
CREATE INDEX "re_entry_candidates_animal_id_idx" ON "re_entry_candidates"("animal_id");

-- CreateIndex
CREATE INDEX "animals_identity_id_idx" ON "animals"("identity_id");

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "animal_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_entry_candidates" ADD CONSTRAINT "re_entry_candidates_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_entry_candidates" ADD CONSTRAINT "re_entry_candidates_matched_animal_id_fkey" FOREIGN KEY ("matched_animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
