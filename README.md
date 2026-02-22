# Golden Years Club

**A last chance for senior animals on shelter euthanasia lists.**

Golden Years Club surfaces senior dogs and cats facing euthanasia at municipal shelters across the U.S., giving them the visibility they need to find forever homes before their time runs out.

🌐 **[goldenyears.club](https://goldenyears.club)**

---

## Features

- **Live urgency list** — Animals ordered by euthanasia deadline with real-time countdown badges
- **Smart filters** — Filter by species, sex, state, zip code proximity, and text search
- **Animal profiles** — Detailed pages with age, breed, intake reason, shelter stats, and life expectancy data
- **AI-powered assessment** — Gemini Vision analyzes shelter photos for age estimation, breed detection, health scoring, behavioral signals, and photo quality
- **Breed life expectancy** — Shows estimated years remaining vs. euthanasia deadline to frame urgency
- **Age discrepancy detection** — Flags conflicts between shelter-reported and CV-estimated ages
- **Cross-source dedup** — 3-tier duplicate detection (exact match → photo URL → perceptual hash) prevents duplicate listings across data sources
- **Temporal tracking** — Tracks how long each animal has been in the shelter and captures snapshots over time
- **Shelter profiles** — Public intake/euthanasia data, live release rates, sourced from dynamic data feeds
- **Public Square** — Community polls on animal welfare policy with fact-based arguments
- **Modular scraper pipeline** — Adapter-based system supporting multiple data sources with JSON-driven configuration

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| AI/CV | Google Gemini (`@google/genai`) |
| Image Processing | Sharp (perceptual hashing) |
| Styling | Vanilla CSS (modular, design-system-driven) |
| Deployment | Railway |
| Auth | Cookie-based site gate |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
# Required: DATABASE_URL, SITE_PASSWORD, GEMINI_API_KEY
# Optional: SHELTERLUV_API_KEY, RESCUEGROUPS_API_KEY

# Run database migrations
npx prisma migrate dev

# Seed shelters + sample animals
npm run seed

# Start dev server
npm run dev
# → http://localhost:3002
```

## Project Structure

```
src/
├── app/                        # Next.js App Router pages
│   ├── page.tsx                # Homepage (listings)
│   ├── animal/[id]/            # Animal detail
│   ├── shelter/[id]/           # Shelter detail
│   ├── poll/                   # Public Square
│   ├── login/                  # Auth gate
│   ├── give/                   # Support page
│   ├── about/                  # About page
│   ├── api/                    # API routes (login, poll vote/results, health)
│   └── *.css                   # Modular stylesheets (globals, listings, detail, etc.)
├── components/                 # Client components (favorite, share, email)
└── lib/
    ├── queries.ts              # Data access layer
    ├── db.ts                   # Prisma client singleton
    ├── utils.ts                # Pure utility functions
    ├── types.ts                # Shared TypeScript types
    └── poll-utils.ts           # Poll result aggregation

scraper/
├── index.ts                    # Main scraper pipeline (municipal shelters)
├── run-rescuegroups.ts         # RescueGroups.org pipeline
├── run-euth-sources.ts         # Euthanasia list pipeline
├── run-shelterluv.ts           # ShelterLuv API pipeline
├── run-opendata.ts             # Open data portal pipeline (Socrata)
├── run-shelter-stats.ts        # Shelter Animals Count stats
├── run-petdata.ts              # PetData stats
├── run-breed-db.ts             # Breed database population
├── dedup.ts                    # 3-tier duplicate detection (exact/URL/pHash)
├── backfill-hashes.ts          # One-time photo hash backfill + dedup scan
├── shelters.ts                 # Shelter configuration
├── types.ts                    # Scraper-specific types
├── config/                     # JSON configs for data sources
│   ├── shelterluv-config.json  # ShelterLuv org IDs
│   └── opendata-config.json    # Socrata portal endpoints
├── cv/                         # Computer vision pipeline
│   ├── index.ts                # CV provider factory
│   ├── gemini-provider.ts      # Gemini Vision implementation
│   ├── prompts.ts              # Assessment prompt (age, health, behavior, photo quality)
│   ├── types.ts                # AnimalAssessment types
│   ├── breed-lifespan.ts       # Breed life expectancy lookup
│   └── text-fallback.ts        # Text-based age estimation fallback
└── adapters/                   # Data source adapters
    ├── la-county.ts            # LA County Animal Care
    ├── oc-animal-care.ts       # OC Animal Care
    ├── memphis.ts              # Memphis Animal Services
    ├── rescuegroups.ts         # RescueGroups.org API
    ├── html-at-risk.ts         # HTML euthanasia list scraper
    ├── shelterluv.ts           # ShelterLuv API
    ├── opendata-outcomes.ts    # Socrata open data portals
    ├── breed-db.ts             # AKC/CFA breed data APIs
    ├── petdata.ts              # PetData shelter stats
    └── shelter-animals-count.ts # Shelter Animals Count (ASPCA)

prisma/
├── schema.prisma               # Database schema
├── seed.ts                     # Seed data
└── seeds/                      # State-by-state shelter data
```

## Data Sources

| Source | Type | Status |
|---|---|---|
| Municipal shelter scrapers (LA County, OC) | Direct scraping | ✅ Active |
| RescueGroups.org API | JSON API | ✅ Active |
| Euthanasia list scrapers | HTML scraping | ✅ Active |
| ShelterLuv API | JSON API | 🔧 Configured |
| Socrata Open Data (Austin, Sonoma) | JSON API | 🔧 Configured |
| Shelter Animals Count (ASPCA) | JSON API | 🔧 Configured |
| PetData | JSON API | 🔧 Configured |
| AKC/CFA Breed Database | JSON API | 🔧 Configured |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3002 |
| `npm run build` | Generate Prisma client + production build |
| `npm run start` | Deploy migrations + start production server |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed database with shelters + animals |
| `npm run scrape` | Run main scraper pipeline |
| `npx tsx scraper/run-rescuegroups.ts` | Run RescueGroups pipeline |
| `npx tsx scraper/run-euth-sources.ts` | Run euthanasia list pipeline |
| `npx tsx scraper/run-shelterluv.ts` | Run ShelterLuv pipeline |
| `npx tsx scraper/run-opendata.ts` | Run open data pipeline |
| `npx tsx scraper/run-shelter-stats.ts` | Run shelter stats pipeline |
| `npx tsx scraper/run-petdata.ts` | Run PetData pipeline |
| `npx tsx scraper/run-breed-db.ts` | Populate breed profiles |
| `npx tsx scraper/backfill-hashes.ts` | Backfill photo hashes + dedup scan |
| `npx tsx --test scraper/dedup.test.ts` | Run dedup unit tests |

## License

Private.
