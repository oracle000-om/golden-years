---
description: Pre-commit checklist for Golden Years Club
---

# Commit Checklist

Run these checks before committing to ensure nothing is broken.

## Quick Checks

// turbo-all

1. **TypeScript compiles cleanly**:
```bash
npx tsc --noEmit
```

2. **ESLint passes** (warnings OK, errors should be zero or known):
```bash
npx eslint src/ --max-warnings 30
```

3. **Unit tests pass**:
```bash
npm test
```

4. **Smoke test passes** (requires dev server running on :3002):
```bash
npx playwright test tests/e2e/smoke.spec.ts --project="Desktop Chrome"
```

## Before Merging to Main

5. **Full E2E suite**:
```bash
npx playwright test --project="Desktop Chrome"
```

6. **Build succeeds**:
```bash
npm run build
```

## Commit Message Convention

Use conventional commit style:
- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code refactor (no behavior change)
- `data:` — Scraper config or data source changes
- `style:` — CSS / visual changes
- `test:` — Test additions or updates
- `docs:` — Documentation updates
- `chore:` — Tooling, deps, CI changes
