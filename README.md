# Golden Years Club

**A last chance for senior animals on shelter euthanasia lists.**

Golden Years Club surfaces senior dogs and cats facing euthanasia at shelters and rescues across the U.S., giving them the visibility they need to find forever homes before their time runs out.

🌐 **[goldenyears.club](https://goldenyears.club)**

---

## Features

- **Live urgency list** — Animals ordered by euthanasia deadline with real-time countdown badges
- **Smart search & filters** — Species, sex, state, source type, zip code proximity with radius, typeahead autocomplete, and sort controls
- **Server-side pagination** — Efficient paging across thousands of listings
- **Animal profiles** — Detailed pages with age, breed, intake reason, shelter stats, life expectancy, and multi-photo gallery
- **AI-powered assessment** — Gemini Vision analyzes shelter photos for age estimation, breed detection, health scoring (physical, medical, comfort sub-scores), behavioral signals, and photo quality
- **Breed life expectancy** — Shows estimated Golden Years remaining vs. breed lifespan to frame urgency
- **Age discrepancy detection** — Flags conflicts between shelter-reported and CV-estimated ages with breed confidence tooltips
- **Cross-source dedup** — 3-tier duplicate detection (exact match → photo URL → perceptual hash) prevents duplicate listings across data sources
- **Temporal tracking** — Tracks how long each animal has been in the shelter, captures snapshots over time, and shows delta-since-intake health changes
- **Status lifecycle** — Animals flow through Available → Adopted / Delisted / Transferred / Returned / Euthanized with outcome banners and data freshness indicators
- **Shelter profiles** — Public intake/euthanasia data, live release rates, no-kill badge visualization
- **Public Square** — Community polls on animal welfare policy with fact-based arguments
- **Admin dashboard** — Overview stats, source breakdowns (municipal/rescue/foster), shelter leaderboard, CV confidence, and stale animal monitoring
- **Admin data chat** — Natural language interface to query the database (e.g., "what percent of intake are dogs at this shelter")
- **Modular scraper pipeline** — Adapter-based system supporting 8+ data sources with JSON-driven configuration and automated reconciliation

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
# Optional: RESCUEGROUPS_API_KEY

# Run database migrations
npx prisma migrate dev

# Start dev server
npm run dev
# → http://localhost:3002
```

## Project Structure

```
src/
├── app/                        # Next.js App Router pages
│   ├── page.tsx                # Homepage (listings)
│   ├── listings/               # Search bar, filter bar, listing components
│   ├── animal/[id]/            # Animal detail
│   ├── shelter/[id]/           # Shelter detail
│   ├── poll/                   # Public Square
│   ├── admin/                  # Admin dashboard
│   │   ├── page.tsx            # Overview stats
│   │   ├── animals/            # Animal analytics
│   │   ├── shelters/           # Shelter list
│   │   └── chat/               # Natural language data chat
│   ├── login/                  # Auth gate
│   ├── give/                   # Support page
│   ├── about/                  # About page
│   ├── api/                    # API routes (login, animals, suggest, image-proxy, admin-chat)
│   └── *.css                   # Modular stylesheets (globals, listings, detail, admin, etc.)
├── components/                 # Client components (fact bubbles, shelter stats charts, etc.)
└── lib/
    ├── queries.ts              # Data access layer
    ├── admin-queries.ts        # Admin dashboard queries
    ├── db.ts                   # Prisma client singleton
    ├── utils.ts                # Pure utility functions
    ├── types.ts                # Shared TypeScript types
    └── poll-utils.ts           # Poll result aggregation

scraper/
├── index.ts                    # Main scraper pipeline (direct API shelters)
├── run-rescuegroups.ts         # RescueGroups.org bulk pipeline
├── run-shelterluv.ts           # ShelterLuv API bulk pipeline
├── run-petango.ts              # Petango/24PetConnect bulk pipeline
├── run-adoptapet.ts            # Adopt-a-Pet bulk pipeline
├── run-socrata-listings.ts     # Socrata active inventory pipeline
├── run-opendata.ts             # Open data portal pipeline (outcomes)
├── run-shelter-stats.ts        # Shelter Animals Count stats
├── run-breed-db.ts             # Breed database population
├── dedup.ts                    # 3-tier duplicate detection (exact/URL/pHash)
├── shelters.ts                 # Shelter configuration (direct + web + socrata)
├── types.ts                    # Scraper-specific types
├── config/                     # JSON configs for data sources
│   ├── shelterluv-config.json  # ShelterLuv org IDs
│   ├── petfinder-config.json   # Petfinder org slugs
│   ├── petango-config.json     # Petango authkeys
│   ├── adoptapet-config.json   # Adopt-a-Pet shelter IDs
│   └── opendata-config.json    # Socrata portal endpoints
├── cv/                         # Computer vision pipeline
│   ├── index.ts                # CV provider factory
│   ├── gemini-provider.ts      # Gemini Vision implementation
│   ├── prompts.ts              # Assessment prompt (age, health, behavior, photo quality)
│   ├── types.ts                # AnimalAssessment types
│   ├── breed-lifespan.ts       # Breed life expectancy lookup
│   └── text-fallback.ts        # Text-based age estimation fallback
└── adapters/                   # Data source adapters
    ├── la-county.ts            # LA County Animal Care (direct API)
    ├── oc-animal-care.ts       # OC Animal Care (direct API)
    ├── nyc-acc.ts              # Animal Care Centers of NYC (direct API)
    ├── maricopa.ts             # Maricopa County Animal Care (direct API)
    ├── harris-county.ts        # Harris County Pets (direct API)
    ├── web-shelters.ts         # Config-driven web scraper (multiple shelters)
    ├── rescuegroups.ts         # RescueGroups.org API
    ├── shelterluv.ts           # ShelterLuv API
    ├── petfinder.ts            # Petfinder GraphQL (no API key)
    ├── petango.ts              # Petango/24PetConnect API
    ├── adoptapet.ts            # Adopt-a-Pet API
    ├── socrata-listings.ts     # Socrata active inventory
    ├── opendata-outcomes.ts    # Socrata open data portals (outcomes)
    ├── breed-db.ts             # AKC/CFA breed data APIs
    └── shelter-animals-count.ts # Shelter Animals Count (ASPCA)

prisma/
├── schema.prisma               # Database schema
└── seed.ts                     # Seed data
```

## Data Sources

| Source | Type | Coverage | Status |
|---|---|---|---|
| Municipal shelter APIs (LA, OC, NYC, Maricopa, Harris County) | Direct API | 5 major metro areas | ✅ Active |
| RescueGroups.org | JSON API | ~600+ rescue orgs nationwide | ✅ Active |
| Petfinder | GraphQL | ~150+ orgs nationwide | ✅ Active |
| ShelterLuv | JSON API | ~200+ orgs | ✅ Active |
| Petango / 24PetConnect | JSON API | ~50+ orgs | ✅ Active |
| Adopt-a-Pet | JSON API | Configured shelters | ✅ Active |
| Web shelter scraper | HTML scraping | Config-driven, multi-shelter | ✅ Active |
| Socrata open data portals | JSON API | Austin, Sonoma, + more | ✅ Active |
| Shelter Animals Count (ASPCA) | JSON API | Shelter intake/outcome stats | ✅ Active |
| AKC/CFA Breed Database | JSON API | Breed profiles + lifespans | ✅ Active |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3002 |
| `npm run build` | Generate Prisma client + production build |
| `npm run start` | Deploy migrations + start production server |
| `npm run lint` | Run ESLint |
| `npm run scrape` | Run main scraper pipeline |
| `npx tsx scraper/run-rescuegroups.ts` | Run RescueGroups pipeline |
| `npx tsx scraper/run-petfinder.ts` | Run Petfinder pipeline |
| `npx tsx scraper/run-shelterluv.ts` | Run ShelterLuv pipeline |
| `npx tsx scraper/run-petango.ts` | Run Petango pipeline |
| `npx tsx scraper/run-adoptapet.ts` | Run Adopt-a-Pet pipeline |
| `npx tsx scraper/run-socrata-listings.ts` | Run Socrata listings pipeline |
| `npx tsx scraper/run-opendata.ts` | Run open data pipeline |
| `npx tsx scraper/run-shelter-stats.ts` | Run shelter stats pipeline |
| `npx tsx scraper/run-breed-db.ts` | Populate breed profiles |

All scraper scripts accept `--dry-run` (preview), `--no-cv` (skip AI), and `--shelter=<id>` (single source) flags.

## API Roadmap

Golden Years Club is building toward an **open-source senior animal welfare API**. See [`.agents/API_VISION.md`](.agents/API_VISION.md) for the full vision, data ownership model, and phased rollout plan.

## License

Private.
