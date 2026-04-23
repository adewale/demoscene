### 2026-04-22 — GitHub rate limits must stop the sync

**Context:** Hardening the scheduled GitHub crawl and sync summary reporting.
**What happened:** GitHub `403`/`429` responses were treated as generic transient failures, so scheduled runs could continue partway through the queue while still looking healthy.
**Resolution:** Added explicit rate-limit parsing from `Retry-After` and `X-RateLimit-Reset`, stopped the remaining repo work for the run, and surfaced `reposDeferredByRateLimit` plus `rateLimitedUntil` in the sync summary.
**Rule:** Treat GitHub rate limits as a first-class deferred state, not a generic transient error.

### 2026-04-22 — Negative-cache repos that are not publishable projects

**Context:** Reducing GitHub crawl volume for repos that do not belong in the feed.
**What happened:** Repos without a top-level Wrangler config, and repos with malformed Wrangler config, were rediscovered and fully re-probed on every daily run.
**Resolution:** Added `repository_scan_state` persistence with revisit windows for `ignored` and `invalid_config` outcomes, and clear that state once a repo becomes publishable or disappears.
**Rule:** Persist negative scan results and revisit them on a slower cadence instead of re-crawling them every day.

### 2026-04-22 — Daily sync and reconcile sync are different jobs

**Context:** Fixing scheduled behavior so the crawl is efficient without pruning too aggressively.
**What happened:** Treating every scheduled run like a full reconcile mixed incremental discovery with pruning/removal behavior and increased unnecessary work.
**Resolution:** Split scheduled sync into a daily incremental cron and a weekly reconcile cron, keeping pruning and full reconciliation on the slower cadence.
**Rule:** Default scheduled runs to incremental mode; reserve pruning and missing-repo reconciliation for the explicit reconcile cadence.

### 2026-04-22 — Feed freshness must reflect publication updates, not repo birth order

**Context:** Correcting the public JSON and RSS feed behavior.
**What happened:** `/feed.json` and `/rss.xml` were unbounded, and RSS `lastBuildDate` was derived from the first item ordered by repo creation time rather than from the freshest included update.
**Resolution:** Paginated `feed.json`, capped RSS output, and computed RSS freshness from the included items' `lastSeenAt` timestamps.
**Rule:** Keep machine-readable feeds bounded, and derive feed freshness from publication/update timestamps, not repository chronology.

### 2026-04-22 — Fast-check date arbitraries need guardrails here

**Context:** Adding property-based tests for sync policy and RSS helpers.
**What happened:** `fast-check` date arbitraries shrank to invalid dates during PBT, which caused false failures unrelated to the production behavior under test.
**Resolution:** Constrained and filtered test date generators to valid dates before asserting time-based invariants.
**Rule:** When writing PBT around time in this repo, constrain `fc.date()` to valid bounded ranges and filter out invalid dates.
