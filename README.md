# Golden Years Club

**A last chance for senior animals on shelter euthanasia lists.**

Golden Years Club surfaces senior dogs and cats facing euthanasia at municipal shelters across all 50 U.S. states, giving them the visibility they need to find forever homes before their time runs out.

---

## Features

- **Live urgency list** — Animals ordered by euthanasia deadline with real-time countdown badges
- **Smart filters** — Filter by species, sex, state, time window, and text search
- **Animal profiles** — Detailed pages with age, breed, intake reason, shelter stats, and life expectancy data
- **CV age estimation** — Gemini AI analyzes animal photos to estimate age and detect breeds
- **Breed life expectancy** — Shows years remaining vs. euthanasia deadline to frame urgency
- **Age discrepancy detection** — Flags conflicts between shelter-reported and CV-estimated ages
- **Shelter profiles** — Public intake/euthanasia data, live release rates, YoY trends
- **Public Square** — Community polls on animal welfare policy with fact-based arguments
- **Scraper pipeline** — Modular adapter system for ingesting shelter data (Petfinder, RescueGroups)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components) |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| AI/CV | Google Gemini (`@google/genai`) |
| Styling | Vanilla CSS (modular, design-system-driven) |
| Auth | Cookie-based site gate |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# → Fill in DATABASE_URL, SITE_PASSWORD, GEMINI_API_KEY

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
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Homepage (listings)
│   ├── animal/[id]/        # Animal detail
│   ├── shelter/[id]/       # Shelter detail
│   ├── poll/               # Public Square
│   ├── login/              # Auth gate
│   ├── give/               # Support page
│   ├── about/              # About page
│   ├── api/                # API routes (login, poll vote/results)
│   ├── globals.css         # Design system (variables, reset, base)
│   ├── listings.css        # Card grid, filters, search, skeleton
│   ├── detail.css          # Animal detail page
│   ├── shelter.css         # Shelter detail page
│   ├── components.css      # Shared component styles
│   └── poll.css            # Public Square styles
├── components/             # Client components (favorite, share, email)
└── lib/
    ├── queries.ts          # Data access layer
    ├── db.ts               # Prisma client singleton
    ├── utils.ts            # Pure utility functions
    ├── types.ts            # Shared TypeScript types
    └── poll-utils.ts       # Poll result aggregation

scraper/
├── index.ts                # Main scraper pipeline
├── cv.ts                   # Gemini CV integration
├── life-expectancy.ts      # Breed lifespan database
└── adapters/               # Shelter data source adapters

prisma/
├── schema.prisma           # Database schema
├── seed.ts                 # Seed data (232 shelters, 8 animals, 10 polls)
└── seeds/                  # State-by-state shelter data
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3002 |
| `npm run build` | Generate Prisma client + production build |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed database with shelters + animals |
| `npm run scrape` | Run scraper pipeline |

## License

Private.
