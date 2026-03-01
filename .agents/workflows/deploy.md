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

This triggers `deploy-staging.yml`, which:
- Runs `prisma migrate deploy` against the staging database
- Deploys to the staging Railway service

The staging site shows an orange **⚠️ STAGING ENVIRONMENT** banner.

### 2. QA on staging

- Visit the staging URL
- Spot-check homepage, animal detail pages, admin dashboard
- If schema migrations ran, verify data integrity

### 3. Promote to production

Once staging looks good:

```bash
git push origin main
```

Railway auto-deploys on push to `main`. If schema changes are pending, `prisma migrate deploy` runs during the build step.

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

In the Railway dashboard, click the previous deployment and redeploy it.
