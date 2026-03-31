-- CreateIndex
CREATE INDEX "animals_status_species_photo_url_idx" ON "animals"("status", "species", "photo_url");

-- CreateIndex
CREATE INDEX "animals_status_euth_scheduled_at_created_at_idx" ON "animals"("status", "euth_scheduled_at", "created_at");
