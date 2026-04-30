import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../src/domain";
import { TEAM_MEMBERS } from "../../src/config/repositories";
import { app } from "../../src/index";
import { processQueueBatch } from "../../src/queue/consumer";
import { runScheduledSync } from "../../src/scheduled";
import MIGRATION_INITIAL_SQL from "../../migrations/0001_initial.sql?raw";
import MIGRATION_REPO_CREATION_ORDER_SQL from "../../migrations/0002_repo_creation_order.sql?raw";
import MIGRATION_REPO_CREATED_AT_SQL from "../../migrations/0003_repo_created_at.sql?raw";
import MIGRATION_REPOSITORY_SCAN_STATE_SQL from "../../migrations/0004_repository_scan_state.sql?raw";
import MIGRATION_SYNC_RUNS_SQL from "../../migrations/0005_sync_runs.sql?raw";
import MIGRATION_SYNC_OPERATIONS_SQL from "../../migrations/0006_sync_operations.sql?raw";
import MIGRATION_QUEUE_COORDINATION_SQL from "../../migrations/0007_queue_coordination.sql?raw";

const testEnv = env as unknown as AppEnv;
const DAILY_CRON = "0 12 * * *";
const SCHEDULED_AT = Date.parse("2026-04-28T12:00:00.000Z");

type MockResponse = {
  body: string;
  headers?: Record<string, string>;
  status?: number;
};

async function applyMigrationSql(migrationSql: string) {
  for (const statement of migrationSql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await testEnv.DB.prepare(statement).run();
  }
}

async function resetDatabase() {
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_planner_locks").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_run_phases").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_run_jobs").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_runs").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_state").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS github_response_cache").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS repository_scan_state").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS project_products").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS projects").run();

  for (const migrationSql of [
    MIGRATION_INITIAL_SQL,
    MIGRATION_REPO_CREATION_ORDER_SQL,
    MIGRATION_REPO_CREATED_AT_SQL,
    MIGRATION_REPOSITORY_SCAN_STATE_SQL,
    MIGRATION_SYNC_RUNS_SQL,
    MIGRATION_SYNC_OPERATIONS_SQL,
    MIGRATION_QUEUE_COORDINATION_SQL,
  ]) {
    await applyMigrationSql(migrationSql);
  }
}

function createQueuedEnv() {
  const sentOwnerMessages: unknown[] = [];
  const sentRepoMessages: unknown[] = [];
  const ownerQueue = {
    send: vi.fn(async (message: unknown) => {
      sentOwnerMessages.push(message);
    }),
  } as unknown as Queue<unknown>;
  const repoQueue = {
    send: vi.fn(async (message: unknown) => {
      sentRepoMessages.push(message);
    }),
  } as unknown as Queue<unknown>;

  return {
    env: {
      ...testEnv,
      OWNER_QUEUE: ownerQueue,
      QUEUE_SYNC_ENABLED: "true",
      REPO_QUEUE: repoQueue,
    } satisfies AppEnv,
    ownerQueue,
    repoQueue,
    sentOwnerMessages,
    sentRepoMessages,
  };
}

function buildUserRepositoriesApiUrl(login: string, page: number): string {
  return `https://api.github.com/users/${login}/repos?sort=created&direction=desc&per_page=100&page=${page}`;
}

function buildRepositoryApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}`;
}

function buildRepositoryApiResponse(values: {
  owner: string;
  repo: string;
}): MockResponse {
  return {
    body: JSON.stringify(buildRepositoryPayload(values)),
    headers: { "content-type": "application/json" },
  };
}

function buildRepositoryPayload(values: { owner: string; repo: string }) {
  return {
    created_at: "2026-04-14T12:00:00.000Z",
    default_branch: "main",
    homepage: "https://demo.example.com",
    html_url: `https://github.com/${values.owner}/${values.repo}`,
    id: 12345,
    name: values.repo,
    owner: { login: values.owner },
  };
}

function buildRepositoryListing(values: { owner: string; repo: string }) {
  return {
    body: JSON.stringify([buildRepositoryPayload(values)]),
    headers: { "content-type": "application/json" },
  };
}

function buildSyncRepoPayload(values: { owner: string; repo: string }) {
  return {
    correlationId: "corr-1",
    discoveredAt: "2026-04-28T12:00:00.000Z",
    kind: "sync-repo",
    mode: "incremental",
    owner: values.owner,
    repo: values.repo,
    repoUrl: `https://github.com/${values.owner}/${values.repo}`,
    runId: "1",
    schemaVersion: 1,
  };
}

function createMockFetch(responses: Record<string, MockResponse>) {
  const responseByUrl = new Map(Object.entries(responses));

  return vi.fn(async (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const response = responseByUrl.get(url);

    return new Response(response?.body ?? "Not found", {
      headers: response?.headers,
      status: response?.status ?? (response ? 200 : 404),
    });
  });
}

function createQueueMessage(body: unknown) {
  return {
    ack: vi.fn(),
    body,
    retry: vi.fn(),
  };
}

function createMessageBatch(
  messages: Array<ReturnType<typeof createQueueMessage>>,
) {
  return { messages } as unknown as MessageBatch<unknown>;
}

function findSentOwnerMessage(
  messages: unknown[],
  owner: string,
): unknown | undefined {
  return messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      "owner" in message &&
      message.owner === owner,
  );
}

function createSentOwnerQueueMessage(
  queued: ReturnType<typeof createQueuedEnv>,
  owner: string,
) {
  return createQueueMessage(
    findSentOwnerMessage(queued.sentOwnerMessages, owner),
  );
}

function createFirstRepoQueueMessage(
  queued: ReturnType<typeof createQueuedEnv>,
) {
  return createQueueMessage(queued.sentRepoMessages[0]);
}

function buildEmptyRepositoryListing(): MockResponse {
  return {
    body: JSON.stringify([]),
    headers: { "content-type": "application/json" },
  };
}

async function planQueuedSync() {
  const queued = createQueuedEnv();

  await runScheduledSync({
    cron: DAILY_CRON,
    env: queued.env,
    scheduledAt: SCHEDULED_AT,
  });

  return queued;
}

async function fetchJobStatus(jobId: string) {
  return (await testEnv.DB.prepare(
    `SELECT attempt_count, last_error, status, rate_limited_until
     FROM sync_run_jobs
     WHERE id = ?`,
  )
    .bind(jobId)
    .first()) as {
    attempt_count: number;
    last_error: string | null;
    rate_limited_until: string | null;
    status: string;
  } | null;
}

async function seedProjectRecord(values: { owner: string; repo: string }) {
  await testEnv.DB.prepare(
    `INSERT INTO projects (
      slug, owner, repo, repo_url, repo_creation_order, repo_created_at, homepage_url, branch, wrangler_path, wrangler_format,
      readme_markdown, readme_preview_markdown, preview_image_url, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `${values.owner}/${values.repo}`,
      values.owner,
      values.repo,
      `https://github.com/${values.owner}/${values.repo}`,
      1,
      "2026-04-14T12:00:00.000Z",
      "https://demo.example.com",
      "main",
      "wrangler.toml",
      "toml",
      "# Demo",
      "# Demo",
      null,
      "2026-04-14T12:00:00.000Z",
      "2026-04-14T12:00:00.000Z",
    )
    .run();
}

async function seedSyncRepoJob(values: {
  rateLimitedUntil?: string | null;
  repo: string;
  status: string;
}) {
  await testEnv.DB.prepare(
    `INSERT INTO sync_run_jobs (
      id, run_id, correlation_id, semantic_key, schema_version, kind, mode, owner, repo, repo_url,
      status, attempt_count, payload_json, queued_at, rate_limited_until, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `1:sync-repo:incremental:adewale/${values.repo}`,
      "1",
      "corr-1",
      `sync-repo:adewale/${values.repo}`,
      1,
      "sync-repo",
      "incremental",
      "adewale",
      values.repo,
      `https://github.com/adewale/${values.repo}`,
      values.status,
      1,
      JSON.stringify(
        buildSyncRepoPayload({ owner: "adewale", repo: values.repo }),
      ),
      "2026-04-28T12:00:00.000Z",
      values.rateLimitedUntil ?? null,
      values.rateLimitedUntil ?? "2026-04-28T12:00:00.000Z",
    )
    .run();
}

async function countRows(tableName: string): Promise<number> {
  const row = (await testEnv.DB.prepare(
    `SELECT COUNT(*) AS value FROM ${tableName}`,
  ).first()) as { value: number } | null;

  return row?.value ?? 0;
}

describe("queue-backed scheduled planner", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates one logical run and one scan-owner job per owner without changing public data", async () => {
    const queued = createQueuedEnv();

    const summary = await runScheduledSync({
      cron: DAILY_CRON,
      env: queued.env,
      scheduledAt: SCHEDULED_AT,
    });
    const latestRun = (await testEnv.DB.prepare(
      `SELECT execution_path, mode, planned_owner_count, planned_repo_count, status
       FROM sync_runs
       ORDER BY id DESC
       LIMIT 1`,
    ).first()) as Record<string, unknown> | null;
    const ownerJobs = await testEnv.DB.prepare(
      `SELECT kind, mode, owner, status
       FROM sync_run_jobs
       ORDER BY owner ASC`,
    ).all();

    expect(summary).toEqual(
      expect.objectContaining({ accountsScanned: 0, reposDiscovered: 0 }),
    );
    expect(latestRun).toEqual({
      execution_path: "queue",
      mode: "incremental",
      planned_owner_count: TEAM_MEMBERS.length,
      planned_repo_count: 0,
      status: "queued",
    });
    expect(ownerJobs.results).toHaveLength(TEAM_MEMBERS.length);
    expect(ownerJobs.results).toEqual(
      TEAM_MEMBERS.map((member) => ({
        kind: "scan-owner",
        mode: "incremental",
        owner: member.login,
        status: "queued",
      })).sort((left, right) => left.owner.localeCompare(right.owner)),
    );
    expect(queued.ownerQueue.send).toHaveBeenCalledTimes(TEAM_MEMBERS.length);
    expect(await countRows("projects")).toBe(0);
  });

  it("deduplicates repeated planning for the same scheduled event", async () => {
    const queued = createQueuedEnv();

    await runScheduledSync({
      cron: DAILY_CRON,
      env: queued.env,
      scheduledAt: SCHEDULED_AT,
    });
    await runScheduledSync({
      cron: DAILY_CRON,
      env: queued.env,
      scheduledAt: SCHEDULED_AT,
    });

    expect(await countRows("sync_runs")).toBe(1);
    expect(await countRows("sync_run_jobs")).toBe(TEAM_MEMBERS.length);
    expect(queued.ownerQueue.send).toHaveBeenCalledTimes(TEAM_MEMBERS.length);
  });

  it("does not plan fresh work while an unexpired planner lock exists", async () => {
    const queued = createQueuedEnv();

    await testEnv.DB.prepare(
      `INSERT INTO sync_planner_locks (name, run_id, correlation_id, acquired_at, expires_at)
       VALUES ('scheduled', 'existing-run', 'existing-correlation', ?, ?)`,
    )
      .bind("2026-04-28T11:59:00.000Z", "2026-04-28T12:10:00.000Z")
      .run();

    const summary = await runScheduledSync({
      cron: DAILY_CRON,
      env: queued.env,
      scheduledAt: SCHEDULED_AT,
    });

    expect(summary).toEqual(
      expect.objectContaining({ accountsScanned: 0, reposDiscovered: 0 }),
    );
    expect(await countRows("sync_runs")).toBe(0);
    expect(await countRows("sync_run_jobs")).toBe(0);
    expect(queued.ownerQueue.send).not.toHaveBeenCalled();
  });

  it("exposes queue job counts, failed/deferred jobs, and replay through debug routes", async () => {
    const queued = await planQueuedSync();
    const failedJob = (await testEnv.DB.prepare(
      `SELECT id, run_id
       FROM sync_run_jobs
       ORDER BY owner ASC
       LIMIT 1`,
    ).first()) as { id: string; run_id: string } | null;
    const deferredJob = (await testEnv.DB.prepare(
      `SELECT id
       FROM sync_run_jobs
       ORDER BY owner DESC
       LIMIT 1`,
    ).first()) as { id: string } | null;

    expect(failedJob).not.toBeNull();
    expect(deferredJob).not.toBeNull();

    await testEnv.DB.prepare(
      `UPDATE sync_run_jobs
       SET status = 'failed', last_error = 'boom', last_error_stage = 'discover', last_error_kind = 'transient'
       WHERE id = ?`,
    )
      .bind(failedJob?.id)
      .run();
    await testEnv.DB.prepare(
      `UPDATE sync_run_jobs
       SET status = 'deferred', rate_limited_until = '2026-04-28T12:30:00.000Z'
       WHERE id = ?`,
    )
      .bind(deferredJob?.id)
      .run();

    const countsResponse = await app.request(
      `http://127.0.0.1/debug/queue/sync-runs/${failedJob?.run_id}/job-counts`,
      {},
      queued.env,
    );
    const failedResponse = await app.request(
      "http://127.0.0.1/debug/queue/jobs/latest-failed",
      {},
      queued.env,
    );
    const deferredResponse = await app.request(
      "http://127.0.0.1/debug/queue/jobs/latest-deferred",
      {},
      queued.env,
    );
    const replayResponse = await app.request(
      `http://127.0.0.1/debug/queue/dlq/${failedJob?.id}/replay`,
      { method: "POST" },
      queued.env,
    );
    const replayedJob = (await testEnv.DB.prepare(
      `SELECT replay_of_job_id, status
       FROM sync_run_jobs
       WHERE id = ?`,
    )
      .bind(failedJob?.id)
      .first()) as { replay_of_job_id: string | null; status: string } | null;

    expect(countsResponse.status).toBe(200);
    expect(await countsResponse.json()).toEqual({
      counts: expect.arrayContaining([
        { count: 1, kind: "scan-owner", status: "deferred" },
        { count: 1, kind: "scan-owner", status: "failed" },
      ]),
      runId: failedJob?.run_id,
    });
    expect(failedResponse.status).toBe(200);
    expect(await failedResponse.json()).toEqual(
      expect.objectContaining({
        id: failedJob?.id,
        lastError: "boom",
        lastErrorKind: "transient",
        lastErrorStage: "discover",
        status: "failed",
      }),
    );
    expect(deferredResponse.status).toBe(200);
    expect(await deferredResponse.json()).toEqual(
      expect.objectContaining({
        id: deferredJob?.id,
        rateLimitedUntil: "2026-04-28T12:30:00.000Z",
        status: "deferred",
      }),
    );
    expect(replayResponse.status).toBe(202);
    expect(await replayResponse.json()).toEqual({
      accepted: true,
      jobId: failedJob?.id,
    });
    expect(replayedJob).toEqual({
      replay_of_job_id: failedJob?.id,
      status: "queued",
    });
    expect(queued.ownerQueue.send).toHaveBeenCalledTimes(
      TEAM_MEMBERS.length + 1,
    );
  });

  it("finalizes a queue run from durable job rows", async () => {
    const queued = await planQueuedSync();
    const run = (await testEnv.DB.prepare(
      `SELECT id FROM sync_runs ORDER BY id DESC LIMIT 1`,
    ).first()) as { id: number } | null;

    await testEnv.DB.prepare(
      `UPDATE sync_run_jobs
       SET status = 'succeeded'
       WHERE kind = 'scan-owner'`,
    ).run();
    await seedSyncRepoJob({ repo: "broken-demo", status: "failed" });

    const response = await app.request(
      `http://127.0.0.1/debug/queue/sync-runs/${run?.id}/finalize`,
      { method: "POST" },
      queued.env,
    );
    const updatedRun = await testEnv.DB.prepare(
      `SELECT processed_owner_count, processed_repo_count, status
       FROM sync_runs
       WHERE id = ?`,
    )
      .bind(run?.id)
      .first();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ runId: String(run?.id), status: "partial" }),
    );
    expect(updatedRun).toEqual({
      processed_owner_count: TEAM_MEMBERS.length,
      processed_repo_count: 1,
      status: "partial",
    });
  });

  it("automatically finalizes a queue run when the last active job completes", async () => {
    const queued = await planQueuedSync();
    const queueMessage = createSentOwnerQueueMessage(queued, "adewale");

    await testEnv.DB.prepare(
      `UPDATE sync_run_jobs
       SET status = 'succeeded', finished_at = '2026-04-28T12:01:00.000Z'
       WHERE kind = 'scan-owner' AND owner != 'adewale'`,
    ).run();

    await processQueueBatch(createMessageBatch([queueMessage]), queued.env, {
      fetch: createMockFetch({
        [buildUserRepositoriesApiUrl("adewale", 1)]:
          buildEmptyRepositoryListing(),
      }) as typeof fetch,
      now: new Date("2026-04-28T12:02:00.000Z"),
    });

    const run = await testEnv.DB.prepare(
      `SELECT planned_repo_count, processed_owner_count, processed_repo_count, status
       FROM sync_runs
       WHERE id = 1`,
    ).first();

    expect(queueMessage.ack).toHaveBeenCalledTimes(1);
    expect(run).toEqual({
      planned_repo_count: 0,
      processed_owner_count: TEAM_MEMBERS.length,
      processed_repo_count: 0,
      status: "succeeded",
    });
  });

  it("processes one owner queue message by enqueueing repo work without syncing inline", async () => {
    const queued = await planQueuedSync();
    const queueMessage = createSentOwnerQueueMessage(queued, "adewale");
    const fetchImpl = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]: buildRepositoryListing({
        owner: "adewale",
        repo: "queued-demo",
      }),
      [buildRepositoryApiUrl("adewale", "queued-demo")]:
        buildRepositoryApiResponse({ owner: "adewale", repo: "queued-demo" }),
      "https://github.com/adewale/queued-demo": {
        body: `<a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>`,
      },
      "https://raw.githubusercontent.com/adewale/queued-demo/main/wrangler.toml":
        {
          body: `name = "queued-demo"`,
        },
    });

    await processQueueBatch(createMessageBatch([queueMessage]), queued.env, {
      fetch: fetchImpl as typeof fetch,
      now: new Date("2026-04-28T12:01:00.000Z"),
    });

    const project = await testEnv.DB.prepare(
      `SELECT owner, repo FROM projects WHERE slug = 'adewale/queued-demo'`,
    ).first();
    const repoJob = await testEnv.DB.prepare(
      `SELECT id, kind, owner, repo, status
       FROM sync_run_jobs
       WHERE kind = 'sync-repo'`,
    ).first();

    expect(queueMessage.ack).toHaveBeenCalledTimes(1);
    expect(queueMessage.retry).not.toHaveBeenCalled();
    expect(await fetchJobStatus("1:scan-owner:incremental:adewale")).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        last_error: null,
        status: "succeeded",
      }),
    );
    expect(queued.repoQueue.send).toHaveBeenCalledTimes(1);
    expect(repoJob).toEqual({
      id: "1:sync-repo:incremental:adewale/queued-demo",
      kind: "sync-repo",
      owner: "adewale",
      repo: "queued-demo",
      status: "queued",
    });
    expect(project).toBeNull();
  });

  it("processes repo queue messages idempotently through one durable job and project row", async () => {
    const queued = await planQueuedSync();
    const ownerMessage = createSentOwnerQueueMessage(queued, "adewale");
    const fetchImpl = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]: buildRepositoryListing({
        owner: "adewale",
        repo: "queued-demo",
      }),
      [buildRepositoryApiUrl("adewale", "queued-demo")]:
        buildRepositoryApiResponse({ owner: "adewale", repo: "queued-demo" }),
      "https://github.com/adewale/queued-demo": {
        body: `<a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>`,
      },
      "https://raw.githubusercontent.com/adewale/queued-demo/main/wrangler.toml":
        {
          body: `name = "queued-demo"`,
        },
    });

    await processQueueBatch(createMessageBatch([ownerMessage]), queued.env, {
      fetch: fetchImpl as typeof fetch,
      now: new Date("2026-04-28T12:01:00.000Z"),
    });

    const repoMessage = createFirstRepoQueueMessage(queued);
    const duplicateRepoMessage = createFirstRepoQueueMessage(queued);

    await processQueueBatch(
      createMessageBatch([repoMessage, duplicateRepoMessage]),
      queued.env,
      {
        fetch: fetchImpl as typeof fetch,
        now: new Date("2026-04-28T12:02:00.000Z"),
      },
    );

    const projectCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS value FROM projects WHERE slug = 'adewale/queued-demo'`,
    ).first<{ value: number }>();
    const repoJobCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS value FROM sync_run_jobs WHERE kind = 'sync-repo'`,
    ).first<{ value: number }>();

    expect(repoMessage.ack).toHaveBeenCalledTimes(1);
    expect(duplicateRepoMessage.ack).toHaveBeenCalledTimes(1);
    expect(repoMessage.retry).not.toHaveBeenCalled();
    expect(duplicateRepoMessage.retry).not.toHaveBeenCalled();
    expect(projectCount).toEqual({ value: 1 });
    expect(repoJobCount).toEqual({ value: 1 });
    expect(
      await fetchJobStatus("1:sync-repo:incremental:adewale/queued-demo"),
    ).toEqual(
      expect.objectContaining({
        attempt_count: 2,
        last_error: null,
        status: "succeeded",
      }),
    );
  });

  it("queues missing-repo verification and removes a deleted repo through the repo queue", async () => {
    await seedProjectRecord({ owner: "adewale", repo: "deleted-demo" });
    const queued = await planQueuedSync();
    const ownerMessage = createSentOwnerQueueMessage(queued, "adewale");
    const fetchImpl = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildEmptyRepositoryListing(),
      [buildRepositoryApiUrl("adewale", "deleted-demo")]: {
        body: "not found",
        status: 404,
      },
    });

    await processQueueBatch(createMessageBatch([ownerMessage]), queued.env, {
      fetch: fetchImpl as typeof fetch,
      now: new Date("2026-04-28T12:01:00.000Z"),
    });

    const verifyMessage = createFirstRepoQueueMessage(queued);

    await processQueueBatch(createMessageBatch([verifyMessage]), queued.env, {
      fetch: fetchImpl as typeof fetch,
      now: new Date("2026-04-28T12:02:00.000Z"),
    });

    expect(queued.repoQueue.send).toHaveBeenCalledTimes(1);
    expect(queued.sentRepoMessages[0]).toEqual(
      expect.objectContaining({
        kind: "verify-missing-repo",
        owner: "adewale",
        repo: "deleted-demo",
      }),
    );
    expect(verifyMessage.ack).toHaveBeenCalledTimes(1);
    expect(await countRows("projects")).toBe(0);
    expect(
      await fetchJobStatus(
        "1:verify-missing-repo:incremental:adewale/deleted-demo",
      ),
    ).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        status: "succeeded",
      }),
    );
  });

  it("re-enqueues due deferred repo jobs before planning fresh owner work", async () => {
    const queued = await planQueuedSync();

    await seedSyncRepoJob({
      rateLimitedUntil: "2026-04-28T12:30:00.000Z",
      repo: "deferred-demo",
      status: "deferred",
    });
    await testEnv.DB.prepare(
      `UPDATE sync_run_jobs
       SET status = 'succeeded'
       WHERE kind = 'scan-owner'`,
    ).run();

    await runScheduledSync({
      cron: DAILY_CRON,
      env: queued.env,
      scheduledAt: Date.parse("2026-04-29T12:00:00.000Z"),
    });

    expect(queued.sentRepoMessages[0]).toEqual(
      expect.objectContaining({
        kind: "sync-repo",
        repo: "deferred-demo",
      }),
    );
    expect(
      await fetchJobStatus("1:sync-repo:incremental:adewale/deferred-demo"),
    ).toEqual(
      expect.objectContaining({
        rate_limited_until: null,
        status: "queued",
      }),
    );
    expect(queued.ownerQueue.send).toHaveBeenCalledTimes(
      TEAM_MEMBERS.length * 2,
    );
  });

  it("defers only the rate-limited owner job and keeps unrelated owner work isolated", async () => {
    const queued = await planQueuedSync();
    const adewaleMessage = createSentOwnerQueueMessage(queued, "adewale");
    const zekeMessage = createSentOwnerQueueMessage(queued, "zeke");
    const fetchImpl = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]: {
        body: "rate limited",
        headers: {
          "retry-after": "120",
          "x-ratelimit-remaining": "0",
        },
        status: 429,
      },
      [buildUserRepositoriesApiUrl("zeke", 1)]: buildEmptyRepositoryListing(),
    });

    await processQueueBatch(
      createMessageBatch([adewaleMessage, zekeMessage]),
      queued.env,
      {
        fetch: fetchImpl as typeof fetch,
        now: new Date("2026-04-28T12:01:00.000Z"),
      },
    );

    expect(adewaleMessage.ack).toHaveBeenCalledTimes(1);
    expect(adewaleMessage.retry).not.toHaveBeenCalled();
    expect(zekeMessage.ack).toHaveBeenCalledTimes(1);
    expect(zekeMessage.retry).not.toHaveBeenCalled();
    expect(await fetchJobStatus("1:scan-owner:incremental:adewale")).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        rate_limited_until: expect.any(String),
        status: "deferred",
      }),
    );
    expect(await fetchJobStatus("1:scan-owner:incremental:zeke")).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        status: "succeeded",
      }),
    );
  });

  it("retries a failed owner job without blocking other messages in the batch", async () => {
    const queued = await planQueuedSync();
    const adewaleMessage = createSentOwnerQueueMessage(queued, "adewale");
    const zekeMessage = createSentOwnerQueueMessage(queued, "zeke");
    const fetchImpl = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]: {
        body: "server error",
        status: 500,
      },
      [buildUserRepositoriesApiUrl("zeke", 1)]: buildEmptyRepositoryListing(),
    });

    await processQueueBatch(
      createMessageBatch([adewaleMessage, zekeMessage]),
      queued.env,
      {
        fetch: fetchImpl as typeof fetch,
        now: new Date("2026-04-28T12:01:00.000Z"),
      },
    );

    expect(adewaleMessage.ack).not.toHaveBeenCalled();
    expect(adewaleMessage.retry).toHaveBeenCalledTimes(1);
    expect(zekeMessage.ack).toHaveBeenCalledTimes(1);
    expect(zekeMessage.retry).not.toHaveBeenCalled();
    expect(await fetchJobStatus("1:scan-owner:incremental:adewale")).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        last_error: "Owner scan failed for adewale",
        status: "failed",
      }),
    );
    expect(await fetchJobStatus("1:scan-owner:incremental:zeke")).toEqual(
      expect.objectContaining({
        attempt_count: 1,
        status: "succeeded",
      }),
    );
  });
});
