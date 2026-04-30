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

### 2026-04-23 — RSS readers treat our HTML body as product UI

**Context:** Cleaning up how Demoscene entries appear in downstream readers like Planet Cloudflare.
**What happened:** The RSS item title, description HTML, and `content:encoded` were all rendered almost verbatim, so repeated repo-name headings, generic README section headings, and large preview images made entries look noisy.
**Resolution:** Kept the repo title in RSS `<title>` only, removed preview images from RSS bodies, and filtered generic heading-only paragraphs before truncating the description.
**Rule:** For RSS in this repo, treat description HTML like shipped UI: de-duplicate against the item title and keep the body text-first.

### 2026-04-23 — Verify microtypography in the browser, not just from CSS declarations

**Context:** Tuning the homepage tagline to be quieter and to match the `Cloudflare DevRel` rail heading.
**What happened:** The declared `.site-tagline` font size looked smaller in code, but the actual rendered size stayed larger because the broader `.site-header p` rule had higher specificity and was overriding part of the intended styling.
**Resolution:** Measured computed styles in Playwright, raised the tagline selector specificity, and added a browser-level regression that compares the tagline's rendered font size and letter spacing with the rail heading.
**Rule:** When exact typography matters in this UI, verify computed styles in a browser test and watch for broad element selectors overriding component-specific classes.

### 2026-04-24 — Deleted repos must fall out of the feed before weekly reconcile

**Context:** Investigating why `zeke/colorize` still appeared in a downstream aggregator even though the GitHub repo now returns 404.
**What happened:** Planet-style aggregators can keep items they already ingested even after the source feed drops them, so waiting for the weekly reconcile job to prune a repo that vanished from a team member's listing leaves a long enough window for stale items to become permanent downstream.
**Resolution:** Kept weekly reconcile for broad pruning, but made daily incremental sync explicitly re-check tracked repos that disappeared from the GitHub listing and remove them immediately if their repo API now returns 404.
**Rule:** In this repo, treat "missing from the GitHub listing" as a repo to verify immediately during incremental sync, not something to defer entirely to the weekly reconcile.

### 2026-04-25 — README title lines can leak into RSS summaries

**Context:** Continuing the RSS cleanup after switching item titles to story-style phrasing.
**What happened:** Some README previews flattened a repeated project heading and its summary into a single paragraph, so downstream readers still rendered `Agentic Inbox`-style title duplication even though standalone heading paragraphs were already filtered out.
**Resolution:** Strip a duplicate project-title line from the start of the first RSS summary paragraph before paragraph-level filtering, and keep a unit regression for the same-paragraph case.
**Rule:** For RSS summaries in this repo, clean duplicate project-title lines inside the first paragraph, not just whole heading paragraphs.

### 2026-04-26 — Scheduled syncs need durable run records and deploy-time remote migrations

**Context:** Investigating why the live cron stopped updating Demoscene after the repository scan-state rollout.
**What happened:** The Worker code started requiring a new D1 table, but the deployment flow only documented remote migrations instead of enforcing them. The cron then failed against the stale remote schema, and because scheduled runs only wrote transient console logs there was no durable last-run/error record to inspect from the app data.
**Resolution:** Added a remote migration step to the deploy script, a remote migration drift check, and a `sync_runs` table that records every scheduled success/failure with summary or error details.
**Rule:** In this repo, every deploy must apply and verify remote D1 migrations first, and scheduled syncs must persist their outcome in D1 instead of relying on logs alone.

### 2026-04-27 — Static owner order starves later accounts under rate limits

**Context:** Auditing why several newer publishable repos were missing from the live site even after scheduler health improved.
**What happened:** Discovery walked team members in a fixed order and stopped on GitHub rate limit, so the same early accounts made progress while later accounts repeatedly missed fresh scans.
**Resolution:** Rotated the starting owner, persisted resume state for partial runs, and interleaved repo processing across owners so partial runs make fairer progress.
**Rule:** When scheduled work can stop early in this repo, preserve a resume cursor and avoid fixed account ordering that starves the tail of the queue.

### 2026-04-29 — Queue test helpers must stay below duplicate thresholds

**Context:** Implementing the first queue-backed sync planner and owner-consumer tests.
**What happened:** The new queue fixtures initially passed behavior tests but dropped branch coverage below the threshold, then duplicated enough batch/fetch setup to trip `jscpd`.
**Resolution:** Added explicit branch tests for every queue message variant and factored repeated owner-message/listing setup into test helpers.
**Rule:** When adding queue migration tests, cover all message variants directly and centralize repeated queue/fetch fixture setup before running the full gate.
