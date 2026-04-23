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

### 2026-04-23 — Intrinsic layout beats character-count heuristics for the rail

**Context:** Tightening the desktop team rail so it fit the longest team label without wasting width.
**What happened:** A `ch`-based width heuristic looked reasonable in code review but still produced a rail that was visually too wide and brittle against real browser rendering.
**Resolution:** Replaced the character-count sizing helper with intrinsic `max-content` sizing plus a small fixed minimum, and kept a Playwright regression that fails when any desktop team row overflows.
**Rule:** For text-driven UI sizing in this repo, prefer intrinsic browser layout with a browser-level overflow regression over `ch`-based width guesses.

### 2026-04-23 — Align to the real panel border, not decorative corner chrome

**Context:** Matching the top of the desktop rail to the first project card in the main column.
**What happened:** The little corner square on the card extends above the true panel border, so visual alignment looked wrong when measured against the decoration instead of the card edge.
**Resolution:** Measured the live DOM boxes and aligned the rail to the first card's actual top border line, not the protruding corner widget or the interior content line.
**Rule:** When aligning panel edges in this UI, measure against the real border box rather than decorative corner elements.

### 2026-04-23 — Cloudflare cron strings should use named weekdays

**Context:** Deploying the split daily/weekly scheduled sync.
**What happened:** Cloudflare rejected the weekly cron expression `17 3 * * 0` even though it looked like a standard Sunday schedule.
**Resolution:** Switched the weekly schedule to `17 3 * * SUN` in both Worker code and Wrangler config, then redeployed.
**Rule:** In this repo, use named weekdays like `SUN` for Cloudflare weekly cron schedules instead of numeric day-of-week values.
