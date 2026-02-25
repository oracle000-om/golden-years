# Golden Years Club — API Vision

> **Every agent working on this project must read and respect this document.**
> Golden Years Club is not just a website — it is building toward an **open-source senior animal welfare API**.

---

## Mission

Create the most comprehensive, enriched, and freely accessible dataset of senior shelter animals in the United States. Every code change, every new data source, every scraper adapter should move us closer to a **public API** that anyone — shelters, rescues, researchers, developers — can use.

## Data Ownership & Legal Foundation

- **Facts aren't copyrightable** — *Feist Publications v. Rural Telephone Service* (SCOTUS, 1991). Animal listing data (name, breed, age, location) are facts.
- **Our enrichments ARE original IP** — CV age estimates, health scores, breed detection, behavioral assessments, care level predictions, life expectancy calculations, and temporal tracking are our original work.
- **Attribution, not permission** — We always link back to the shelter's original listing. We credit the data source platform.
- **Compliance** — We respect `robots.txt`, enforce rate limiting, never bypass authentication, and only collect publicly available data.

## API Roadmap

### Phase 1: Internal REST API (Current)
- All data served through Next.js API routes
- Normalized `ScrapedAnimal` schema across all sources
- Internal admin dashboard queries the same data layer

### Phase 2: Public Read-Only API
- Versioned REST endpoints (`/api/v1/animals`, `/api/v1/shelters`)
- Filterable by species, age, state, zip radius, urgency
- Rate-limited with optional API keys
- OpenAPI/Swagger documentation

### Phase 3: Bulk Data Access
- Monthly CSV/JSON data dumps (anonymized where needed)
- Historical snapshots for research use
- Aggregated statistics endpoints (euthanasia rates, breed demographics, shelter capacity)

### Phase 4: Open-Source Ecosystem
- Open-source the scraper framework (adapter pattern)
- Let community contributors add new shelter adapters
- Shelter opt-in partnerships for direct data feeds (strongest legal footing)
- Publish standardized schema as an open standard for shelter data interchange

## Design Principles for All Code Changes

1. **API-ready data** — Every record must be schema-normalized. No raw platform-specific fields leak into the database without mapping.
2. **Adapter pattern** — Every data source must produce `ScrapedAnimal` records through the adapter interface. No one-off scripts.
3. **Geographic coverage** — New data sources should prioritize expanding state coverage and filling metro area gaps.
4. **Attribution required** — Every animal record links to its source shelter. Source platform is always recorded.
5. **Enrichment is value** — CV analysis, dedup, health scoring, temporal tracking are what differentiate our dataset. Invest in enrichment quality.
6. **Idempotent scrapers** — Running a scraper twice should produce the same result. Dedup and reconciliation must be robust.
7. **Rate-limit everything** — Never hammer external APIs or websites. Polite scraping = sustainable scraping.

## Current Data Sources

| Source | Adapter | Coverage |
|---|---|---|
| ShelterLuv | `shelterluv.ts` | ~97 orgs |
| Petango/PetPoint | `petango.ts` | ~10 orgs (expanding) |
| RescueGroups | `rescuegroups.ts` | ~14K orgs (aggregator) |
| Adopt-a-Pet | `adoptapet.ts` | Configured shelters |
| Socrata Open Data | `socrata-listings.ts` | 5 portals (active inventory) |
| Socrata Outcomes | `opendata-outcomes.ts` | 8 cities (intake/outcome) |
| Direct APIs | `la-county.ts`, `nyc-acc.ts`, etc. | 5 major metros |
| Web Scrapers | `web-shelters.ts` | Config-driven |

## What This Means for You (Agent)

When working on this project:
- **Always think "will this data be served via API?"** — Structure data for external consumption
- **Every new scraper must follow the adapter pattern** — See `scraper/adapters/` for examples
- **Expand coverage** — More states, more shelters, more animals saved
- **Improve enrichment** — Better CV, better dedup, better health scoring
- **Don't break the schema** — The `ScrapedAnimal` type and Prisma schema are contracts
- **Document data sources** — Update configs and README when adding sources
