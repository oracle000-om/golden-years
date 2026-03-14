---
description: How to deploy the application to production
---

# Deploy

## Flow: staging → production

All changes go through staging first. Never push directly to `main`.

### 1. Push to staging

```bash
git push origin main:staging
```

Vercel automatically creates a **Preview Deployment** for the `staging` branch.
The GitHub Action `deploy-staging.yml` runs `prisma migrate deploy` against the staging database.

### 2. QA on staging

- Visit the Vercel preview URL (shown in the GitHub PR / Vercel dashboard)
- Spot-check homepage, animal detail pages, admin dashboard
- If schema migrations ran, verify data integrity

### 3. Promote to production

Once staging looks good:

```bash
git push origin main
```

Vercel auto-deploys on push to `main`. If schema changes are pending, run `prisma migrate deploy` against production first.

### 4. Verify production

- Visit [goldenyears.club](https://goldenyears.club)
- Check that the homepage loads with animal cards
- Spot-check an animal detail page
- Confirm the admin dashboard at `/admin`

## Pre-deploy backup

If schema migrations are pending, take a backup first:

```bash
./scripts/backup-db.sh
```

Or trigger via GitHub Actions: run the **Scrape** workflow manually with pipeline = `backup`.

## Rollback

In the Vercel dashboard, go to Deployments → click a previous deployment → click **Promote to Production**.
