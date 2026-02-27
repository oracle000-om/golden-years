# Contributing to Golden Years Club

Thanks for your interest in helping senior shelter animals get the visibility they deserve! 🐾

## Getting Started

```bash
# Clone the repo
git clone https://github.com/oracle000-om/golden-years.git
cd golden-years

# Install dependencies
npm install

# Copy env template and fill in your values
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start dev server
npm run dev
# → http://localhost:3002
```

## Adding a New Data Source

We have a step-by-step guide for adding scrapers: see [`.agents/workflows/add-data-source.md`](.agents/workflows/add-data-source.md).

The short version:

1. Create an adapter in `scraper/adapters/`
2. Create a config JSON in `scraper/config/`
3. Create a run script in `scraper/run-*.ts`
4. Add an npm script and GitHub Actions job
5. Test with `--dry-run` before committing

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Run `npm run build` and `npx vitest run` before submitting
- Scraper changes should include a `--dry-run` test showing the output
- Follow existing code patterns and naming conventions

## Code Style

- TypeScript strict mode
- Vanilla CSS (no Tailwind)
- Server Components by default, `'use client'` only when needed
- Prisma for all database access

## Pre-Commit Hook

This repo uses [gitleaks](https://github.com/gitleaks/gitleaks) to prevent accidental secret commits. Install it locally:

```bash
brew install gitleaks
```

The hook runs automatically on every commit via Husky.

## Security

Found a vulnerability? Please see [SECURITY.md](SECURITY.md) — do not open a public issue.
