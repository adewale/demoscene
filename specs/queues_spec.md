# Queue Migration Spec

## Purpose

Define an initial design for moving Demoscene's sync pipeline from a single scheduled Worker execution path to a cron-planned, queue-driven ingestion pipeline.

This spec is intentionally additive. It describes the target architecture and rollout path without changing the current public read surfaces or top-level Wrangler project-detection rules.

## Goals

- preserve the existing public site, JSON, and RSS behavior
- keep D1 as the source of truth for feed reads
- reduce partial-run starvation when GitHub rate limiting interrupts work
- isolate failures so one owner or repo does not block the rest of the sync
- make sync progress, retries, and failures observable at the owner and repo level
- support resumable work without depending on one long-running scheduled invocation

## Non-Goals

- changing the top-level-only Wrangler inclusion rule
- refreshing stored README content after first discovery
- changing feed ordering or public route shape
- introducing non-Cloudflare infrastructure

## Current Constraints

- Demoscene currently runs as one Worker with one scheduled handler and one D1 database for production content.
- The current sync is already fairer and resumable than before, but it still runs inside one scheduled execution path.
- GitHub discovery and repo processing still share one runtime budget and one upstream rate-limit envelope per run.

## Proposed Architecture

Use a two-stage pipeline:

1. A scheduled planner Worker run decides what work should happen.
2. Cloudflare Queues fan that work out to small, idempotent consumer jobs.

The Worker keeps serving the public site and APIs. D1 remains the read model and coordination store.

## Initial Architecture Diagram

```text
                 ┌──────────────────────────────┐
                 │   Cron Trigger (daily/weekly)│
                 └──────────────┬───────────────┘
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │      Planner / scheduled()   │
                 │ - load sync_state            │
                 │ - create sync_run            │
                 │ - emit wide planner event    │
                 │ - enqueue owner/repo work    │
                 └───────┬──────────────┬───────┘
                         │              │
                         ▼              ▼
              ┌────────────────┐   ┌────────────────┐
              │ OWNER_QUEUE    │   │ REPO_QUEUE     │
              │ scan-owner     │   │ sync-repo      │
              │                │   │ verify-missing │
              └──────┬─────────┘   └──────┬─────────┘
                     │                    │
                     ▼                    ▼
           ┌───────────────────┐  ┌────────────────────┐
           │ Queue consumer    │  │ Queue consumer     │
           │ - GitHub owner    │  │ - metadata         │
           │   discovery       │  │ - Wrangler/package │
           │ - enqueue repo    │  │ - repo page/README │
           │   jobs            │  │ - D1 upsert        │
           │ - emit wide event │  │ - emit wide event  │
           └────────┬──────────┘  └─────────┬──────────┘
                    │                       │
                    └──────────┬────────────┘
                               ▼
                     ┌───────────────────────┐
                     │ D1 coordination/read  │
                     │ - projects            │
                     │ - project_products    │
                     │ - repository_scan_*   │
                     │ - sync_runs           │
                     │ - sync_run_jobs       │
                     │ - sync_run_phases     │
                     │ - sync_state          │
                     │ - github_response_*   │
                     └──────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Public read worker     │
                    │ /  /feed.json /rss.xml │
                    │ /projects/...          │
                    └────────────────────────┘

Observability surfaces:
- Cloudflare Cron Events
- Workers Logs / wrangler tail
- D1-backed operator routes and run/job tables
- Dead-letter queue for retry exhaustion
```

## Design Principles From Existing Queue-Based Projects

This migration should borrow proven patterns from `planet_cf` and `bobbin` instead of inventing a queue model from scratch.

### Lessons from `planet_cf`

- **One queue message per real unit of work**: `planet_cf` schedules one feed fetch per message rather than batching the whole cron into one opaque job.
- **Dead-letter queues are first-class**: retry exhaustion should not disappear into logs; it should land in a durable DLQ path.
- **Retry metadata belongs on the work unit**: attempt count, original correlation ID, and last error should be inspectable per job.
- **Cron is the planner, queue is the executor**: the scheduled task should enqueue work quickly and get out of the way.
- **Wide-event observability helps explain failure location**: one event per request, queue job, or scheduler run with rich dimensions is more useful than scattered logs.

### Lessons from `bobbin`

- **Queue the slow phases, not necessarily everything at once**: `bobbin` keeps a canonical refresh pipeline but fans out the expensive enrichment phase first.
- **Keep the pipeline explicitly phased**: fetch, parse, ingest, enrich, finalize is easier to reason about than one giant async blob.
- **Track stage timings and partial success**: resilient pipelines should continue where safe, while still saying which phase failed.
- **Use queue concurrency for parallelizable work only**: not every phase benefits equally from fan-out.
- **Expose operational maintenance entrypoints**: admin or maintenance commands for specific phases make production debugging much easier.

## Components

### Scheduled planner

- triggered by the existing daily incremental cron and weekly reconcile cron
- loads scheduler state and team-member list
- decides which owner scans, repo syncs, and missing-repo verifications should be enqueued
- writes a top-level `sync_run` record and a planning checkpoint
- enqueues messages to one or more queues

### Queue consumer

- processes queue messages in small batches
- performs owner scan, repo sync, or missing-repo verification work
- updates D1 state and appends structured per-job telemetry
- retries transient failures according to queue policy

### Phase controller

- keeps the top-level run model explicit even after queue fan-out
- records which planner stage and queue stage the system is currently in
- lets operators answer:
  - did the planner fail before enqueueing work?
  - did owner scans fail?
  - did repo sync jobs fail?
  - did reconcile cleanup fail?

### Read worker

- unchanged public routes:
  - `/`
  - `/feed.json`
  - `/rss.xml`
  - `/projects/:owner/:repo.json`
  - support routes and protected debug routes

## Queue Message Types

### `scan-owner`

Purpose:

- fetch one team member's GitHub repo listings
- emit repo-oriented work for newly relevant repos
- emit verification work for tracked repos missing from the listing

Suggested payload:

```json
{
  "schemaVersion": 1,
  "kind": "scan-owner",
  "runId": "sync-run-id",
  "mode": "incremental",
  "owner": "adewale",
  "cursor": 0,
  "correlationId": "planner-request-id",
  "scheduledAt": "2026-04-28T12:00:00.000Z"
}
```

### `sync-repo`

Purpose:

- fetch metadata, top-level Wrangler config, package hints, repo HTML, README-on-first-discovery, and preview media
- create or update the persistent project record

Suggested payload:

```json
{
  "schemaVersion": 1,
  "kind": "sync-repo",
  "runId": "sync-run-id",
  "mode": "incremental",
  "owner": "adewale",
  "repo": "demoscene",
  "repoUrl": "https://github.com/adewale/demoscene",
  "correlationId": "planner-request-id",
  "discoveredAt": "2026-04-28T12:00:05.000Z"
}
```

### `verify-missing-repo`

Purpose:

- check whether a tracked repo that disappeared from a GitHub account listing is actually gone or just omitted from the listing
- preserve the current incremental-vs-reconcile behavior

Suggested payload:

```json
{
  "schemaVersion": 1,
  "kind": "verify-missing-repo",
  "runId": "sync-run-id",
  "mode": "incremental",
  "owner": "adewale",
  "repo": "some-repo",
  "repoUrl": "https://github.com/adewale/some-repo",
  "correlationId": "planner-request-id"
}
```

## Queue Topology

Initial version uses separate queues from day one:

- `OWNER_QUEUE` for `scan-owner` jobs
- `REPO_QUEUE` for `sync-repo` and `verify-missing-repo` jobs
- one dead-letter queue per primary queue from day one

Initial retry posture:

- owner scan queue: low concurrency, low batch size, explicit DLQ
- repo work queue: higher concurrency, small-to-medium batch size, explicit DLQ

Rationale:

- owner discovery and repo ingestion have different throughput, fan-out, and retry characteristics
- separating them makes backpressure and failure localization clearer from the first rollout

This keeps the rollout simple while still isolating the most expensive work.

Later options:

- a separate queue for missing-repo verification
- priority separation for newly discovered repos versus stale revisits

## D1 State Model

Keep the existing read-side tables and add queue-oriented coordination tables.

### Keep

- `projects`
- `project_products`
- `repository_scan_state`
- `sync_runs`
- `sync_state`
- `github_response_cache`

### Add

#### `sync_run_jobs`

Purpose:

- one row per queued job tied to a top-level run

Suggested fields:

- `id`
- `run_id`
- `correlation_id`
- `schema_version`
- `kind`
- `owner`
- `repo`
- `repo_url`
- `status` (`queued`, `processing`, `succeeded`, `failed`, `deferred`, `cancelled`)
- `attempt_count`
- `first_attempt_at`
- `last_error`
- `last_error_stage`
- `last_error_kind`
- `queued_at`
- `started_at`
- `finished_at`
- `rate_limited_until`

#### `owner_scan_state`

Purpose:

- owner-level freshness and continuation markers independent of the top-level run

Suggested fields:

- `owner`
- `last_scanned_at`
- `last_completed_run_id`
- `last_rate_limited_at`
- `next_scan_after`

#### `sync_run_phases`

Purpose:

- make it obvious where a run failed without reconstructing the story from logs

Suggested fields:

- `id`
- `run_id`
- `phase` (`plan`, `owner_scan`, `repo_sync`, `verify_missing`, `reconcile_cleanup`, `finalize`)
- `status` (`pending`, `running`, `succeeded`, `failed`, `partial`)
- `started_at`
- `finished_at`
- `error_count`
- `summary_json`

## Idempotency Rules

- all queue messages must be safe to retry
- `sync-repo` must remain idempotent because the same repo can be enqueued more than once
- `verify-missing-repo` must be safe to retry without double-deleting
- top-level run counters should be derived from durable job rows or updated atomically from consumer completions
- planner re-entry must be safe: if the same cron fires twice or an operator repeats a run, duplicate planning must not produce inconsistent job state
- duplicate queue messages should be resolved to the same durable D1 job row and treated as harmless duplicates rather than as a separate failure mode
- D1 job rows are the durable source of truth for job state; queue delivery is only the transport layer

## Checkpointing Strategy

Checkpointing should become more explicit than the current single-row resume cursor.

### Planner checkpoints

- store the planner phase and the last fully enqueued owner cursor
- store the set or range of owner jobs successfully enqueued
- store whether reconcile-specific cleanup jobs were emitted
- planner runs should acquire a planner lock so only one planning pass is active at a time
- before enqueueing fresh work, the planner should first re-enqueue due deferred jobs and only then plan new owner and repo work

### Consumer checkpoints

- each job row is its own checkpoint
- a job is resumable if it can be retried from the start safely
- if a job contains multiple substeps, record the last completed substep in the job row
- rate-limited jobs should be marked `deferred`, persisted durably, and then ACKed so the queue does not hot-retry them before the planner decides they are due again

### Minimal checkpoint rule

The system must be able to answer, for any run:

- which owners were enqueued
- which owners were scanned successfully
- which repos were enqueued
- which repos were processed successfully
- which items are still deferred or failed
- which deferred items are due to be re-enqueued on the next planner pass

## Fairness Model

The queue design should preserve the current fairness improvements and make them more robust.

- planner rotates the starting owner for each top-level run
- planner enqueues one `scan-owner` per owner rather than draining one owner end-to-end
- owner scans enqueue `sync-repo` work independently, so later owners are no longer blocked by earlier owners' repo volume
- rate-limited jobs are deferred individually instead of aborting the whole pipeline

## GitHub API Strategy

Retain and extend the current optimizations:

- conditional requests for discovery and repo metadata using cached validators
- negative cache for ignored and invalid-config repos
- best-effort package and repo-page fetches only after the repo qualifies as a top-level Wrangler project

Additional queue-specific guidance:

- owner scan jobs should be the only place that pages `/users/:login/repos`
- repo sync jobs should avoid re-fetching owner lists
- if GitHub returns rate-limit headers, store them on the affected job row and reschedule only that unit of work

## Failure Handling

### Transient failures

- retry via queue policy
- record error and attempt count on the job row
- keep the last failing stage (`discover`, `metadata`, `wrangler`, `package`, `repo_page`, `readme`, `upsert`) on the job row

### Rate limits

- mark the job `deferred`
- record `rate_limited_until`
- do not fail unrelated jobs
- ACK the queue message after the deferred state is persisted in D1
- let the next planner run re-enqueue due deferred jobs before planning fresh work
- preserve the queue job and planner correlation IDs so operators can trace which run was interrupted

### Permanent failures

- mark the job `failed`
- surface it in operator tooling and logs
- do not let one permanent failure stall the run

### Dead-letter handling

- jobs should go to a DLQ from day one, following `planet_cf`'s model
- a DLQ record should preserve:
  - original message payload
  - run ID
  - correlation ID
  - attempt count
  - last error
  - last failing stage
- operator tooling should support replaying a DLQ job after the underlying issue is fixed

## Observability

### Wide-event model

Follow the `planet_cf` approach: one event per unit of work, not one event per helper call.

For Demoscene's queue design, the canonical wide events should be:

- one planner event per scheduled run
- one owner-scan event per `scan-owner` message
- one repo-sync event per `sync-repo` message
- one missing-repo verification event per `verify-missing-repo` message

Each wide event should carry enough context to answer:

- which run is this part of?
- which owner or repo is being processed?
- which phase or stage failed?
- how many attempts have happened?
- was the work deferred by rate limiting?
- how long did the unit of work take?

Suggested common fields across wide events:

- `event_type`
- `run_id`
- `correlation_id`
- `job_id`
- `owner`
- `repo`
- `phase`
- `stage`
- `status`
- `attempt_count`
- `rate_limited_until`
- `wall_time_ms`
- `error_kind`
- `error_message`

This should make it possible to answer "what failed, where, and after how many retries?" from one event line plus D1 state, without reconstructing the story from many low-context logs.

### Cloudflare-native

- Cron Events for planner runs
- Workers Logs for planner and consumer logs
- `wrangler tail` for live inspection

### D1-backed operator views

Keep and extend the current protected operator tooling:

- latest run
- latest failed run
- latest rate-limited run
- owner-scoped manual sync

Queue migration should add:

- latest failed job
- latest deferred job
- job counts by kind/status for a run
- owner-level freshness and backlog views
- per-phase run status so operators can see exactly where a run failed
- per-job failing stage and retry count
- DLQ views and replay controls
- planner-lock and overlap state for the current or most recent run

### Correlation model

Every planner run should generate a `correlation_id` that propagates to:

- planner logs/events
- queued owner scan jobs
- queued repo jobs created by an owner scan
- `sync_run_jobs`
- `sync_run_phases`

This follows the spirit of `planet_cf`'s wide-event model and avoids guessing which logs belong to which run.

### Failure localization

The queue design should make failure location obvious at three levels:

1. **Run level** via `sync_run_phases`
2. **Job level** via `sync_run_jobs`
3. **Event level** via wide event fields like `phase`, `stage`, `attempt_count`, and `error_kind`

An operator should be able to answer all of these without code spelunking:

- did planning fail before queueing work?
- which owner scan failed?
- which repo-sync stage failed?
- which jobs are still deferred?
- which jobs exhausted retries and landed in the DLQ?

### Run outcome rules

Terminal job states are:

- `succeeded`
- `failed`
- `deferred`
- `cancelled`

Top-level run status should be derived from terminal job state plus phase state:

- `succeeded` when all terminal jobs are `succeeded` or `cancelled`
- `partial` when any terminal job is `failed` or `deferred`
- `failed` when planning itself fails before the run can reach a coherent partial result

## Public Behavior Contract

The queue migration must not change:

- feed ordering rules
- inclusion rules for top-level Wrangler configs
- README immutability after first discovery
- public route paths and payload shapes

## Rollout Plan

### Phase 0: Spec only

- no behavior changes
- define schema and queue contracts

### Phase 1: Planner + owner queue

- cron still creates one logical `sync_run`
- scheduled runs enqueue `scan-owner` jobs through `OWNER_QUEUE`
- owner scan work moves to queue consumers first
- repo syncs and missing-repo verification still run through the single-run executor path
- add `sync_run_jobs`, `sync_run_phases`, DLQ handling, planner locking, and deferred-job re-enqueue before queueing production owner work
- validate fairness, owner-level observability, and planner checkpoint behavior first

### Phase 2: Repo queue + single-run fallback

- owner scan jobs enqueue `sync-repo` and `verify-missing-repo` work to `REPO_QUEUE`
- repo work moves into queue consumers
- the single-run orchestration path remains available as an emergency or manual fallback
- add per-job failing-stage and retry metadata
- deduplicate deliveries against durable D1 job rows

### Phase 3: Queue-backed default

- queue-backed ingestion becomes the default path for all scheduled syncs
- operator tooling must make it obvious when scheduled runs used the queue path versus the fallback path
- add queue/job debug routes and dashboards
- tighten retry/dead-letter policy
- add replay support for deferred and dead-letter jobs

### Phase 4: Remove single-run executor

- delete the single-run executor only after the retirement gate is satisfied
- keep only shared primitives:
  - `scanOwner()`
  - `syncRepo()`
  - `verifyMissingRepo()`
  - `finalizeRun()`
- keep only the state still needed for planning, queue execution, and read-side operations

### Single-run executor retirement gate

Do not retire the current single-run executor until all of the following are true:

- planner locking exists and prevents overlapping planning passes
- duplicate queue deliveries are harmless because they resolve to the same durable D1 job row
- run finalization is explicit and recorded as a distinct phase
- deferred jobs have a defined re-enqueue policy and that policy is implemented
- DLQ replay exists for exhausted jobs
- operator views expose job counts by status and kind for a run
- public feed output is proven unchanged under queue-backed execution
- queue-backed runs have completed successfully across multiple real cron cycles

## Testing Strategy

### Testability principles

The queue migration should keep the core orchestration testable by moving branching logic into small units rather than burying it inside the queue handler runtime.

Key testability rules:

- message planning should be pure or near-pure where possible
- queue handlers should delegate to small phase functions instead of embedding the whole workflow inline
- retry/defer classification should be explicit and separately testable
- checkpoint transitions should be deterministic and inspectable in D1-backed tests
- wide-event construction should be centralized so observability fields can be asserted directly in tests

Following `bobbin`'s phased-pipeline pattern, the queue design should make each stage independently invocable in tests, for example:

- plan owners
- scan one owner
- expand repo jobs
- sync one repo
- verify one missing repo
- finalize run aggregates

Unit tests:

- message payload validation
- queue routing decisions
- retry/defer classification
- job-state transitions
- planner checkpoint transitions
- per-stage failure classification

Property tests:

- idempotent repo sync behavior under duplicate messages
- fairness/round-robin invariants for owner/job planning
- checkpoint/job aggregation invariants for run summaries
- retry invariants: repeated transient failures never produce duplicate project rows or inconsistent job state

Integration tests:

- planner enqueues expected jobs
- consumer processes owner scan and repo sync messages correctly
- rate-limited jobs defer without aborting unrelated work
- read APIs remain unchanged while queue-backed ingestion updates data
- a run failure clearly reports whether it failed in planning, owner scanning, repo syncing, or finalization
- DLQ replay succeeds after a transiently failing dependency is restored

## Resolved Initial Decisions

- Use separate `OWNER_QUEUE` and `REPO_QUEUE` from day one.
- Add DLQs from day one.
- Add `schemaVersion` to all messages.
- Use D1 job rows as the durable source of truth.
- ACK rate-limited queue messages after marking jobs `deferred`.
- Let the next planner first re-enqueue due deferred jobs, then plan new work.
- Use a planner lock to avoid overlapping planning.
- Treat duplicate queue messages as harmless by resolving them to the same job row.
- Define terminal job states as `succeeded`, `failed`, `deferred`, and `cancelled`.
- Mark a run `partial` when any terminal job is `failed` or `deferred`.

## Remaining Open Questions

- At what backlog size or cron-overlap rate do we stop prioritizing the single-run executor as an operational fallback, even if it still exists in code?
