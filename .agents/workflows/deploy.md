---
description: How to deploy the application to production
---

# Deploy

## Steps

1. **Take a pre-deploy backup** (especially if schema migrations are pending):
```bash
./scripts/backup-db.sh
```
   Or trigger via GitHub Actions: run the **Scrape** workflow manually with pipeline = `backup`.

2. Push to `main` branch — Railway auto-deploys on push.

3. If schema changes are pending, Railway runs `prisma migrate deploy` during the build step via `npm run build`.

4. Verify the deployment:

   - Visit [goldenyears.club](https://goldenyears.club)
   - Check that the homepage loads with animal cards
   - Spot-check an animal detail page
   - Confirm the admin dashboard at `/admin`

## Manual Deploy (if needed)

// turbo
4. Run `railway up` from the project root to deploy the current working directory.

## Rollback

5. In the Railway dashboard, click the previous deployment and redeploy it.

## Staging

Push to the `staging` branch — the `deploy-staging.yml` GitHub Actions workflow will:
1. Run `prisma migrate deploy` against the staging database
2. Deploy to the staging Railway service via `railway up`

The staging site shows an orange **⚠️ STAGING ENVIRONMENT** banner at the top of every page (driven by `ENVIRONMENT=staging` env var on the Railway service).
