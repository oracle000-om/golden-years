---
description: How to run the scraper pipelines
---

# Run Scrapers

All scrapers accept these flags:
- `--dry-run` — Preview only, no DB writes
- `--no-cv` — Skip AI age/health estimation  
- `--shelter=<id>` — Run for a single shelter only

## Core Pipelines (every 8 hours in CI)

// turbo-all

1. **Municipal shelters** (LA, OC, NYC, Maricopa, Harris County):
```bash
npm run scrape
```

2. **RescueGroups.org** (~600+ orgs):
```bash
npx tsx scraper/run-rescuegroups.ts
```

3. **Petfinder** (~150+ orgs, no API key needed):
```bash
npx tsx scraper/run-petfinder.ts
```

4. **Petango / 24PetConnect** (~50+ orgs):
```bash
npx tsx scraper/run-petango.ts
```

5. **ShelterLuv** (~200+ orgs):
```bash
npx tsx scraper/run-shelterluv.ts
```

6. **Adopt-a-Pet**:
```bash
npx tsx scraper/run-adoptapet.ts
```

7. **Socrata active inventory** (Austin, Sonoma, etc.):
```bash
npx tsx scraper/run-socrata-listings.ts
```

## Periodic Pipelines

8. **Open data outcomes** (weekly):
```bash
npx tsx scraper/run-opendata.ts
```

9. **Breed database** (monthly):
```bash
npx tsx scraper/run-breed-db.ts
```

10. **Shelter stats** (monthly):
```bash
npx tsx scraper/run-shelter-stats.ts
```

## Quick Checks

- **Preview what a scraper would do**: Add `--dry-run` to any command above
- **Skip CV for speed**: Add `--no-cv` (useful for initial bulk loads)
- **Single shelter debug**: Add `--shelter=<shelter-id>`
