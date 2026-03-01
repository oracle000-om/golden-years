-- Add rate limit entries table (persistent rate limiting)
CREATE TABLE "rate_limit_entries" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "window_end" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_entries_ip_route_key" ON "rate_limit_entries"("ip", "route");
CREATE INDEX "rate_limit_entries_window_end_idx" ON "rate_limit_entries"("window_end");

-- Add scrape failures table (retry queue)
CREATE TABLE "scrape_failures" (
    "id" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "shelter_id" TEXT,
    "animal_intake_id" TEXT,
    "error_message" TEXT NOT NULL,
    "payload" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_failures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scrape_failures_pipeline_resolved_at_idx" ON "scrape_failures"("pipeline", "resolved_at");
