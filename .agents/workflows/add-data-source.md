---
description: How to add a new data source / scraper
---

# Add a New Data Source

## Steps

1. **Create the adapter** in `scraper/adapters/<source-name>.ts`
   - Export a function like `scrape<SourceName>(options)` that returns `{ animals: ScrapedAnimal[], shelters: Map }`
   - Follow the pattern in existing adapters (e.g., `petfinder.ts`, `shelterluv.ts`)

2. **Create the config** in `scraper/config/<source-name>-config.json`
   - List organization/shelter IDs to scrape
   - Include metadata like name, state, city

3. **Create the run script** at `scraper/run-<source-name>.ts`
   - Import the adapter
   - Follow the pattern: fetch → upsert shelters → upsert animals → reconcile stale

4. **Add an npm script** to `package.json`:
```json
"scrape:<source-name>": "npx tsx scraper/run-<source-name>.ts"
```

5. **Add to GitHub Actions** in `.github/workflows/scrape.yml`:
   - Add option to `workflow_dispatch.inputs.pipeline.options`
   - Add a new job block (follow existing patterns)
   - Choose schedule: `0 2,10,18 * * *` (8h) for active listings, weekly/monthly for stats

6. **Add any required secrets** as GitHub repository secrets

7. **Update README.md**:
   - Add to the Data Sources table
   - Add to the Scripts table
   - Add to the Project Structure tree

8. **Test locally**:
```bash
npx tsx scraper/run-<source-name>.ts --dry-run
npx tsx scraper/run-<source-name>.ts --no-cv
```
