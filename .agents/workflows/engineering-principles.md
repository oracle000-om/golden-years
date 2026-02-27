---
description: Core engineering principles for Golden Years Club
---

# Engineering Principles

## 1. Data Preservation Above All

GYC data represents real animals in real shelters. **Never lose or corrupt data as a side effect of a fix.**

When making changes that touch scraper pipelines, DB writes, or reconciliation:

- **Prefer additive over destructive** — add safeguards rather than removing records
- **Circuit breakers before reconciliation** — if a scraper returns 0 results, skip delisting (upstream is down, not empty)
- **Grace periods for delisting** — animals must be unseen for 48h+ before delisting
- **Per-shelter percentage caps** — never delist >50% of a shelter's animals in one run
- **Absolute caps** — never delist >500 animals total in one pipeline run
- **Soft-delete only** — use `DELISTED` status, never `DELETE FROM`
- **Re-entry protection** — don't inflate `shelterEntryCount` from scraper flakiness (require 48h delist gap)

## 2. Fail Open, Not Closed

When something goes wrong (API down, timeout, bad data), the system should **skip and log**, not crash or wipe data.

- Scraper errors → skip that animal/shelter, continue the run
- Timeout on one shelter → skip it, don't block the shard
- Unknown image hostname → serve unoptimized, don't crash the site
- Bad CV result → keep existing data, don't overwrite with nulls

## 3. No Silent Failures

Every skip, timeout, or error should be logged with enough context to investigate later. Use `sendAlert()` for critical issues (zero-result runs, cap breaches).
