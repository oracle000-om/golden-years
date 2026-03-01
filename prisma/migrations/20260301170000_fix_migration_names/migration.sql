-- Fix inconsistent migration directory names (YYYYMMDD → YYYYMMDD120000)
-- This updates the _prisma_migrations table to match the renamed directories.
-- IMPORTANT: Take a full database backup before running this migration.

UPDATE _prisma_migrations
SET migration_name = '20260225120000_add_rate_limit_and_retry_queue'
WHERE migration_name = '20260225_add_rate_limit_and_retry_queue';

UPDATE _prisma_migrations
SET migration_name = '20260226120000_add_scrape_run'
WHERE migration_name = '20260226_add_scrape_run';

UPDATE _prisma_migrations
SET migration_name = '20260227120000_add_listing_protection'
WHERE migration_name = '20260227_add_listing_protection';
