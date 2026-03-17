-- CreateTable
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "animal_id" TEXT,
    "shelter_id" TEXT,
    "search_query" TEXT,
    "filters" JSONB,
    "referrer" TEXT,
    "region" TEXT,
    "product" TEXT NOT NULL DEFAULT 'gyc',
    "session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_clicks" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT 'gyc',
    "session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_views_created_at_idx" ON "page_views"("created_at");

-- CreateIndex
CREATE INDEX "page_views_animal_id_idx" ON "page_views"("animal_id");

-- CreateIndex
CREATE INDEX "page_views_shelter_id_idx" ON "page_views"("shelter_id");

-- CreateIndex
CREATE INDEX "page_views_path_created_at_idx" ON "page_views"("path", "created_at");

-- CreateIndex
CREATE INDEX "outbound_clicks_created_at_idx" ON "outbound_clicks"("created_at");

-- CreateIndex
CREATE INDEX "outbound_clicks_shelter_id_created_at_idx" ON "outbound_clicks"("shelter_id", "created_at");
