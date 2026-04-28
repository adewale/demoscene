# Queue Migration Checklist

This document is the operational companion to `specs/queues_spec.md`.

Use it for baseline capture, fixture planning, verification gates, operator evidence, and rollout sign-off.

## Resolved Operational Decisions

- Exact command for public-output comparison: `npm run compare:queue-public-surfaces`
- Exact operator route for DLQ replay: `POST /debug/queue/dlq/:jobId/replay`
- Queue-backed execution becomes the default only after:
  - 3 consecutive successful daily queue-backed cron cycles
  - 1 successful weekly reconcile cycle
- Single-run fallback can be removed only after:
  - 10 consecutive successful daily queue-backed cron cycles
  - 2 successful weekly reconcile cycles
  - public output remains unchanged across those cycles
- Planner skips fresh work when active backlog exceeds either threshold:
  - more than 25 owner jobs not in a terminal state
  - more than 500 repo jobs not in a terminal state
- Maximum acceptable deferred-job age:
  - 48 hours for repo work
  - a job older than that marks the pipeline unhealthy and blocks fallback removal

## Reality Capture Before Implementation

Before implementing Phase 1, capture the current single-run behavior so the queue migration has a concrete baseline.

### Current runtime/config reality

- Current Worker entrypoint: `src/index.tsx`
- Current scheduled path: `scheduled() -> runScheduledSync(...)`
- Current sync implementation: `src/sync.ts`
- Current D1 query layer: `src/db/queries.ts`
- Current Wrangler config: `wrangler.jsonc`
- Current cron triggers:
  - `0 12 * * *`
  - `17 3 * * SUN`
- Current verification commands from `package.json`:
  - `npm run test:fast`
  - `npm run test:full`
  - `npm run test:worker`
  - `npm run test:e2e`
  - `npm run build`
  - `npm run db:migrate:local`
  - `npm run db:check:remote`

### Current data reality to capture

Capture and store fixtures for:

- current team member list
- current project count
- current projects grouped by owner
- current `repository_scan_state`
- latest `sync_state`
- latest `sync_runs`
- current `/feed.json`
- current `/rss.xml`
- current `/projects/:owner/:repo.json` for 3 representative repos

### Current behavior baseline

Run the current single-run sync against fixtures and record:

- owners planned
- owners scanned
- repos discovered
- repos processed
- repos deferred by rate limit
- ignored repos
- invalid-config repos
- removed/missing repos
- public feed ordering
- project JSON shape
- runtime duration
- GitHub requests made

### Current failure cases to reproduce

Create fixtures or mocked fetch cases for:

- GitHub rate limit during owner discovery
- GitHub rate limit during repo metadata fetch
- deleted repo
- renamed repo
- private/inaccessible repo
- repo with no top-level Wrangler config
- repo with invalid Wrangler config
- repo with package hints but no Wrangler config
- repo with README missing
- repo with repo page preview metadata missing

### Baseline artifact

Store a baseline report before the queue migration:

```txt
reports/queue-migration/baseline-single-run.json
reports/queue-migration/baseline-feed.json
reports/queue-migration/baseline-rss.xml
reports/queue-migration/baseline-projects/*.json
```

## Public Behavior Verification

The queue migration must prove public behavior is unchanged by comparing single-run and queue-backed outputs against the same fixture corpus.

### Required comparison artifacts

For the same fixture corpus, generate:

```txt
reports/queue-migration/single-run/feed.json
reports/queue-migration/queue-run/feed.json
reports/queue-migration/single-run/rss.xml
reports/queue-migration/queue-run/rss.xml
reports/queue-migration/single-run/projects/*.json
reports/queue-migration/queue-run/projects/*.json
```

### Required checks

- feed item count is unchanged
- feed ordering is unchanged
- project slugs are unchanged
- product chips are unchanged
- top-level Wrangler inclusion decisions are unchanged
- README content for existing projects is unchanged
- route payload shapes are unchanged
- RSS validates and ordering is unchanged

### Suggested commands

```bash
npm run characterize:single-run
npm run characterize:queue-run
npm run characterize:public-surfaces
npm run compare:queue-public-surfaces
```

### Not done if

- snapshots are blindly regenerated
- feed order changes without explicit approval
- existing README content is refreshed accidentally
- queue-backed run produces a different public project set

## Verification Gates

### Phase 0 Verification Gate

Phase 0 is complete only when:

- current single-run baseline report exists
- current public feed/RSS/project JSON baseline exists
- queue message schemas have fixtures
- D1 migration draft exists for queue coordination tables
- test fixtures exist for:
  - successful owner scan
  - rate-limited owner scan
  - successful repo sync
  - invalid Wrangler repo
  - deleted/missing repo
- `npm run test:fast` passes before implementation begins

Suggested commands:

```bash
npm run test:fast
npm run characterize:single-run
npm run characterize:public-surfaces
```

### Phase 1 Verification Gate

Phase 1 is complete only when:

- planner creates exactly one `sync_run`
- planner creates one `scan-owner` job per planned owner
- planner does not perform repo sync inline
- owner queue messages validate against schema
- duplicate planner invocation does not create duplicate durable jobs
- planner lock prevents overlapping planning passes
- owner scan queue can process one owner fixture successfully
- owner scan rate limit marks only that owner job `deferred`
- failed owner scan does not fail unrelated owner jobs
- owner job state is visible in D1
- public routes remain unchanged from baseline

Suggested commands:

```bash
npm run test:worker -- queue-planner
npm run test:worker -- owner-queue
npm run compare:queue-public-surfaces
npm run build
```

Required fixtures:

- `fixtures/queue-migration/owners/success-single-page.json`
- `fixtures/queue-migration/owners/rate-limit-primary.json`
- `fixtures/queue-migration/owners/empty.json`
- `fixtures/queue-migration/owners/deleted-repo-listing.json`

Not done if:

- scheduled handler still performs owner scanning inline
- one owner rate limit aborts all planned owners
- D1 job rows cannot answer which owners were enqueued/scanned

### Phase 2 Verification Gate

Phase 2 is complete only when:

- owner scan jobs enqueue repo jobs
- each repo job resolves to one durable D1 job row
- duplicate repo queue messages are harmless
- `sync-repo` remains idempotent
- `verify-missing-repo` cannot double-delete
- rate-limited repo jobs become `deferred` and are ACKed
- repo sync failure records failing stage:
  - `metadata`
  - `wrangler`
  - `package`
  - `repo_page`
  - `readme`
  - `upsert`
- single-run fallback still works
- queue-backed and single-run public outputs match

Suggested commands:

```bash
npm run test:worker -- repo-queue
npm run test:worker -- missing-repo
npm run test:worker -- queue-idempotency
npm run compare:queue-public-surfaces
npm run test:e2e
```

Required fixtures:

- `fixtures/queue-migration/repos/valid-top-level-wrangler-toml.json`
- `fixtures/queue-migration/repos/valid-top-level-wrangler-jsonc.json`
- `fixtures/queue-migration/repos/nested-only-wrangler.json`
- `fixtures/queue-migration/repos/invalid-wrangler.json`
- `fixtures/queue-migration/repos/readme-missing.json`
- `fixtures/queue-migration/repos/deleted-404.json`
- `fixtures/queue-migration/repos/rate-limit-metadata.json`
- duplicate queue message for the same owner/repo

Not done if:

- duplicate deliveries create duplicate project rows
- missing repo verification deletes without a durable job transition
- public feed differs from baseline

### Phase 3 Verification Gate

Phase 3 is complete only when:

- queue path is default for scheduled syncs
- operator route shows whether a run used queue or fallback
- latest run view shows job counts by kind/status
- deferred jobs are re-enqueued before fresh work
- DLQ replay path works in a controlled fixture
- at least the required real cron cycles complete successfully
- public output remains unchanged across real cron cycles

Suggested commands:

```bash
npm run test:full
npm run smoke:queue-local
npm run smoke:operator-routes
npm run compare:production-public-surfaces
```

Real-world evidence required:

- date/time of successful cron cycle 1
- date/time of successful cron cycle 2
- date/time of successful cron cycle 3
- date/time of successful weekly reconcile
- job counts by status for each run
- public feed comparison after each run

### Phase 4 Verification Gate

The single-run executor can be removed only after the retirement gate has evidence attached.

Evidence required:

- links or IDs for the required successful queue-backed cron runs
- public feed comparison reports
- DLQ replay demonstration
- deferred re-enqueue demonstration
- duplicate delivery idempotency test result
- operator route screenshot/output
- rollback plan if queue path fails after removal

Suggested commands:

```bash
npm run test:full
npm run compare:queue-public-surfaces
npm run smoke:operator-routes
npm run smoke:prod
```

Not done if:

- fallback removal is justified by confidence rather than recorded evidence

## Queue Migration Fixture Corpus

The exact fixture corpus for public behavior equivalence is:

```txt
fixtures/queue-migration/
  owners/
    success-single-page.json
    success-paginated-page1.json
    success-paginated-page2.json
    empty.json
    rate-limit-primary.json
    rate-limit-secondary.json
    deleted-repo-listing.json
  repos/
    valid-top-level-wrangler-toml.json
    valid-top-level-wrangler-jsonc.json
    nested-only-wrangler.json
    invalid-wrangler.json
    package-hints-only.json
    package-missing.json
    readme-present.md
    readme-missing.json
    repo-page-preview-present.html
    repo-page-preview-missing.html
    deleted-404.json
    inaccessible-404.json
  public/
    representative-full-project.json
    representative-minimal-project.json
    representative-package-hints-project.json
```

### Public output fixtures

For each fixture corpus run, store:

- expected project rows
- expected project products
- expected feed order
- expected RSS item order
- expected missing/deleted repo behavior

### Fixture rule

No queue behavior should be considered implemented until it passes against this corpus.

## Verification Matrix

| Claim                             | Evidence                                                                     | Command/test                                  |
| --------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| Public feed unchanged             | single-run vs queue-run feed diff                                            | `npm run compare:queue-public-surfaces`       |
| Top-level Wrangler rule unchanged | fixture with nested Wrangler config remains excluded                         | `npm run test:worker -- wrangler-inclusion`   |
| Duplicate repo messages harmless  | duplicate `sync-repo` messages produce one job row and one project row       | `npm run test:worker -- queue-idempotency`    |
| Rate limit affects only one unit  | rate-limited repo job becomes `deferred`; unrelated jobs succeed             | `npm run test:worker -- queue-rate-limit`     |
| Planner lock prevents overlap     | two planner invocations produce one active planning pass                     | `npm run test:worker -- planner-lock`         |
| DLQ preserves replay data         | exhausted job lands in DLQ with run ID, correlation ID, stage, attempt count | `npm run test:worker -- dlq`                  |
| Operator can locate failure       | failed job appears in latest failed job/operator route                       | `npm run test:worker -- operator-queue-views` |
| Single-run fallback still works   | fallback produces same public surfaces                                       | `npm run compare:single-run-fallback`         |
| Queue-backed default safe         | multiple real cron cycles complete with unchanged public output              | production run reports                        |

## Idempotency Key Design

Each logical job should have a deterministic idempotency key.

Suggested keys:

```txt
scan-owner:
  ${runId}:scan-owner:${mode}:${owner}

sync-repo:
  ${runId}:sync-repo:${mode}:${owner}/${repo}

verify-missing-repo:
  ${runId}:verify-missing-repo:${mode}:${owner}/${repo}
```

Cross-run semantic key for active work:

```txt
${kind}:${owner}/${repo}
```

### Deduplication policy

- primary durable job identity is per run
- while a job with the same semantic key is still `queued`, `processing`, or `deferred`, new planner or queue duplicates should resolve to that existing job row rather than create a second active job row
- after a job reaches a terminal `succeeded`, `failed`, or `cancelled` state, a later run may create a new job row if the work is planned again

### Verification

- enqueue the same message twice
- assert one durable active job row
- assert one project row
- assert job attempt count is coherent

## GitHub Rate-Limit Reality Capture

Before implementing queue-specific rate-limit handling, capture real or fixture responses for:

- primary rate limit
- secondary rate limit
- `403` with `x-ratelimit-remaining: 0`
- `403` secondary abuse/rate response
- `404` deleted or inaccessible repo
- `304` conditional request hit
- network timeout

### Classification

| Response                                                           | Classification                                               | Queue action      | Job state                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------- | ----------------------------------------- |
| `403` primary rate limit                                           | `deferred`                                                   | ACK after persist | `deferred`                                |
| `429` primary rate limit                                           | `deferred`                                                   | ACK after persist | `deferred`                                |
| `403` secondary rate limit with GitHub abuse/rate-limit indicators | `deferred`                                                   | ACK after persist | `deferred`                                |
| `403` without rate-limit indicators                                | permanent auth/config failure unless explicitly reclassified | ACK               | `failed`                                  |
| `404` repo                                                         | permanent or missing-verify                                  | ACK               | `failed` / `removed` / `verified_missing` |
| `304`                                                              | success/cache hit                                            | ACK               | `succeeded`                               |
| timeout                                                            | transient                                                    | retry             | `processing` / `failed after exhaustion`  |

## Operator Question Verification

The migration is not complete until operator tooling can answer these questions from D1 or operator routes without reading logs.

### Required questions

1. Did the planner fail before enqueueing work?
2. Which owners were enqueued?
3. Which owners scanned successfully?
4. Which owner scans failed?
5. Which repos were enqueued?
6. Which repo-sync stage failed?
7. Which jobs are deferred?
8. Which deferred jobs are due?
9. Which jobs exhausted retries?
10. Which DLQ jobs can be replayed?
11. Did this public feed come from queue-backed or fallback sync?

### Verification

Create an integration test that seeds a run with:

- one successful owner
- one failed owner
- one successful repo
- one deferred repo
- one DLQ repo

Then assert operator views return the answers above.

## DLQ Replay Contract

The operator route that proves replay works is:

```txt
POST /debug/queue/dlq/:jobId/replay
```

Success criteria:

- the route records a replay action against the durable job row
- the replayed job preserves `run_id`, `correlation_id`, and semantic key
- the replay either reactivates the existing row or creates an explicitly linked replay attempt row
- operator views show the replay outcome without requiring log inspection
