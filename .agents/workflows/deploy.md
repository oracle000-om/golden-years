---
description: How to deploy the application to production
---

# Deploy

## Flow: staging → production

All changes go through staging first. **Never push directly to `main`.**

### 1. Work on the staging branch

```bash
git checkout staging
```

Make your changes, commit, and push:

```bash
git add -A && git commit -m "description of change"
git push origin staging
```

Railway automatically creates a **Deployment** for the `staging` environment.

### 2. QA on staging

- Visit the Railway staging URL (shown in the Railway dashboard or GitHub)
- Spot-check homepage, animal detail pages, admin dashboard
- If schema migrations ran, verify data integrity

### 3. Promote to production

Once staging looks good, merge into main:

```bash
git checkout main
git merge staging
git push origin main
git checkout staging
```

Railway auto-deploys on push to `main`.

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

In the Railway dashboard, locate the production service → click a previous deployment → click **Redeploy**.

