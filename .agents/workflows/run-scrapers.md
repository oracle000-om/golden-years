---
description: How to run the scraper pipelines
---

# Run Scrapers

All scrapers accept these flags:
- `--dry-run` — Preview only, no DB writes
- `--no-cv` — Skip AI age/health estimation  
- `--shelter=<id>` — Run for a single shelter only

## Daily Pipelines (6:00 / 6:30 UTC)

// turbo-all

1. **Municipal shelters** (LA, OC, NYC, Maricopa, Harris County):
```bash
npm run scrape
```

2. **RescueGroups.org** (~600+ orgs):
```bash
npx tsx scraper/run-rescuegroups.ts
```

3. **Petfinder** (~150+ orgs, 4 shards in CI):
```bash
npx tsx scraper/run-petfinder.ts
# CI: --shard=0 --total-shards=4
```

4. **Petango / 24PetConnect** (~50+ orgs, 4 shards in CI):
```bash
npx tsx scraper/run-petango.ts
```

5. **ShelterLuv** (~200+ orgs, 4 shards in CI):
```bash
npx tsx scraper/run-shelterluv.ts
```

6. **Adopt-a-Pet** (4 shards in CI):
```bash
npx tsx scraper/run-adoptapet.ts
```

## Weekly Pipelines (Sunday 4:00 UTC)

7. **Socrata active inventory** (Austin, Sonoma, etc.):
```bash
npx tsx scraper/run-socrata-listings.ts
```

8. **Open data outcomes**:
```bash
npm run scrape:opendata
```

9. **Confiscation events**:
```bash
npm run scrape:confiscation
```

10. **News busts** (Google News RSS for cruelty cases):
```bash
npm run scrape:news-busts
```

## Monthly Pipelines (1st of month, 5:00 UTC)

11. **State reports** (13 states: NJ, CT, MD, MI, SC, IL, MO, OR, FL, GA, VA, CO, NC):
```bash
npm run scrape:new-jersey
npm run scrape:connecticut
# ... etc, or trigger via CI with pipeline=state-reports
```

12. **USDA / APHIS**:
```bash
npm run scrape:aphis
npm run scrape:aphis-enforcement
npm run scrape:state-kennel
```

13. **Data utilities** (breeds, shelter stats, 990s, ALDF, geocode, enrich, intake, cruelty registry):
```bash
npm run scrape:breeds
npm run scrape:shelter-stats
npm run scrape:990
npm run scrape:aldf
npm run geocode
npm run enrich
npm run scrape:shelter-intake
npm run scrape:cruelty-registry
```

## Annual Pipelines (Jan 15, 6:00 UTC)

14. **Reports & watchlists** (Best Friends, APHIS Research, Horrible Hundred, Lab Retirement, Puppy Imports, Pet Store Bans, AKC Breeds):
```bash
npm run scrape:best-friends
npm run scrape:research
npm run scrape:horrible-hundred
npm run scrape:lab-retirement
npm run scrape:puppy-imports
npm run scrape:pet-store-bans
npm run scrape:akc-breeds
```

## Post-Scrape Jobs (Daily, after scrapes)

15. **CV age/health assessment**: `npx tsx scraper/run-cv.ts`
16. **Retry queue**: `npx tsx scraper/run-retry.ts`

## Quick Checks

- **Preview what a scraper would do**: Add `--dry-run` to any command above
- **Skip CV for speed**: Add `--no-cv` (useful for initial bulk loads)
- **Single shelter debug**: Add `--shelter=<shelter-id>`
- **Manual trigger**: Go to Actions → Scrape → Run workflow → enter pipeline name
