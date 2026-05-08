import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  notInArray,
  or,
} from "drizzle-orm";

import type {
  GitHubResponseCacheRecord,
  ProjectRecord,
  ProjectWithProducts,
  RepositoryScanStateRecord,
  SyncRunRecord,
  SyncStateRecord,
} from "../domain";
import {
  buildQueueJobId,
  buildQueueSemanticKey,
  type QueueJobStatus,
  type QueueMessageBody,
} from "../lib/queue/messages";
import {
  CLOUDFLARE_PRODUCT_BY_KEY,
  isCloudflareProductKey,
} from "../lib/cloudflare-products";
import {
  sortCloudflareProducts,
  type CloudflareProduct,
} from "../lib/wrangler/parse";

import {
  projectProducts,
  projects,
  githubResponseCache,
  repositoryScanState,
  syncPlannerLocks,
  syncRunJobs,
  syncRunPhases,
  syncRuns,
  syncState,
} from "./schema";

type Database = ReturnType<typeof import("./client").createDb>;
const PRODUCT_LOOKUP_BATCH_SIZE = 90;
const ACTIVE_QUEUE_JOB_STATUSES: QueueJobStatus[] = [
  "queued",
  "processing",
  "deferred",
];

function requireProjectChronology(
  row: typeof projects.$inferSelect,
): Pick<ProjectRecord, "repoCreatedAt" | "repoCreationOrder"> {
  if (row.repoCreatedAt === null || row.repoCreationOrder === null) {
    throw new Error(`Project ${row.slug} is missing chronology metadata`);
  }

  return {
    repoCreatedAt: row.repoCreatedAt,
    repoCreationOrder: row.repoCreationOrder,
  };
}

function projectOrdering() {
  return [
    desc(projects.repoCreatedAt),
    desc(projects.repoCreationOrder),
    desc(projects.firstSeenAt),
  ] as const;
}

async function listProjectProductsForSlugs(
  db: Database,
  slugs: string[],
): Promise<(typeof projectProducts.$inferSelect)[]> {
  const productRows: (typeof projectProducts.$inferSelect)[] = [];

  for (
    let index = 0;
    index < slugs.length;
    index += PRODUCT_LOOKUP_BATCH_SIZE
  ) {
    const batch = slugs.slice(index, index + PRODUCT_LOOKUP_BATCH_SIZE);

    productRows.push(
      ...(await db
        .select()
        .from(projectProducts)
        .where(inArray(projectProducts.projectSlug, batch))),
    );
  }

  return productRows;
}

function attachProducts(
  projectRows: (typeof projects.$inferSelect)[],
  productRows: (typeof projectProducts.$inferSelect)[],
): ProjectWithProducts[] {
  const productsBySlug = new Map<string, CloudflareProduct[]>();

  for (const row of productRows) {
    const existing = productsBySlug.get(row.projectSlug) ?? [];

    if (isCloudflareProductKey(row.productKey)) {
      existing.push({
        key: row.productKey,
        label: CLOUDFLARE_PRODUCT_BY_KEY[row.productKey].label,
      });
    }

    productsBySlug.set(row.projectSlug, existing);
  }

  return projectRows.map((row) => ({
    ...requireProjectChronology(row),
    slug: row.slug,
    owner: row.owner,
    repo: row.repo,
    repoUrl: row.repoUrl,
    homepageUrl: row.homepageUrl,
    branch: row.branch,
    wranglerPath: row.wranglerPath,
    wranglerFormat: row.wranglerFormat,
    readmeMarkdown: row.readmeMarkdown,
    readmePreviewMarkdown: row.readmePreviewMarkdown,
    previewImageUrl: row.previewImageUrl,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    products: sortCloudflareProducts(productsBySlug.get(row.slug) ?? []),
  }));
}

async function hydrateProjects(
  db: Database,
  projectRows: (typeof projects.$inferSelect)[],
): Promise<ProjectWithProducts[]> {
  if (projectRows.length === 0) {
    return [];
  }

  const slugs = projectRows.map((project) => project.slug);
  const productRows = await listProjectProductsForSlugs(db, slugs);

  return attachProducts(projectRows, productRows);
}

export async function upsertProject(
  db: Database,
  project: ProjectRecord,
): Promise<void> {
  await db
    .insert(projects)
    .values(project)
    .onConflictDoUpdate({
      target: projects.slug,
      set: {
        repoUrl: project.repoUrl,
        repoCreationOrder: project.repoCreationOrder,
        repoCreatedAt: project.repoCreatedAt,
        homepageUrl: project.homepageUrl,
        branch: project.branch,
        wranglerPath: project.wranglerPath,
        wranglerFormat: project.wranglerFormat,
        readmeMarkdown: project.readmeMarkdown,
        readmePreviewMarkdown: project.readmePreviewMarkdown,
        previewImageUrl: project.previewImageUrl,
        firstSeenAt: project.firstSeenAt,
        lastSeenAt: project.lastSeenAt,
      },
    });
}

export async function replaceProjectProducts(
  db: Database,
  projectSlug: string,
  productsForProject: CloudflareProduct[],
): Promise<void> {
  await db
    .delete(projectProducts)
    .where(eq(projectProducts.projectSlug, projectSlug));

  if (productsForProject.length === 0) {
    return;
  }

  await db.insert(projectProducts).values(
    productsForProject.map((product) => ({
      projectSlug,
      productKey: product.key,
      productLabel: product.label,
    })),
  );
}

export async function deleteProjectBySlug(
  db: Database,
  slug: string,
): Promise<void> {
  await db.delete(projects).where(eq(projects.slug, slug));
}

export async function getProjectByOwnerRepo(
  db: Database,
  owner: string,
  repo: string,
): Promise<ProjectWithProducts | null> {
  const projectRows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.owner, owner), eq(projects.repo, repo)));

  if (projectRows.length === 0) {
    return null;
  }

  const productRows = await db
    .select()
    .from(projectProducts)
    .where(eq(projectProducts.projectSlug, projectRows[0].slug));

  return attachProducts(projectRows, productRows)[0] ?? null;
}

export async function countProjects(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(projects);
  return row?.value ?? 0;
}

export async function listProjectsPage(
  db: Database,
  limit: number,
  offset: number,
): Promise<ProjectWithProducts[]> {
  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(...projectOrdering())
    .limit(limit)
    .offset(offset);

  return hydrateProjects(db, projectRows);
}

export async function listProjectSyncStateByOwners(
  db: Database,
  owners: string[],
): Promise<
  Array<{ lastSeenAt: string; owner: string; repoUrl: string; slug: string }>
> {
  if (owners.length === 0) {
    return [];
  }

  return db
    .select({
      lastSeenAt: projects.lastSeenAt,
      owner: projects.owner,
      repoUrl: projects.repoUrl,
      slug: projects.slug,
    })
    .from(projects)
    .where(inArray(projects.owner, owners));
}

export async function deleteProjectsByOwnersNotIn(
  db: Database,
  owners: string[],
): Promise<number> {
  const staleRows = owners.length
    ? await db
        .select({ slug: projects.slug })
        .from(projects)
        .where(notInArray(projects.owner, owners))
    : await db.select({ slug: projects.slug }).from(projects);

  for (const row of staleRows) {
    await deleteProjectBySlug(db, row.slug);
  }

  return staleRows.length;
}

export async function upsertRepositoryScanState(
  db: Database,
  state: RepositoryScanStateRecord,
): Promise<void> {
  await db
    .insert(repositoryScanState)
    .values({
      lastCheckedAt: state.lastCheckedAt,
      nextCheckAt: state.nextCheckAt,
      owner: state.owner,
      repo: state.repo,
      repoUrl: state.repoUrl,
      status: state.status,
    })
    .onConflictDoUpdate({
      target: repositoryScanState.repoUrl,
      set: {
        lastCheckedAt: state.lastCheckedAt,
        nextCheckAt: state.nextCheckAt,
        owner: state.owner,
        repo: state.repo,
        status: state.status,
      },
    });
}

export async function deleteRepositoryScanStateByRepoUrl(
  db: Database,
  repoUrl: string,
): Promise<void> {
  await db
    .delete(repositoryScanState)
    .where(eq(repositoryScanState.repoUrl, repoUrl));
}

export async function listRepositoryScanStateByOwners(
  db: Database,
  owners: string[],
): Promise<RepositoryScanStateRecord[]> {
  if (owners.length === 0) {
    return [];
  }

  return db
    .select({
      lastCheckedAt: repositoryScanState.lastCheckedAt,
      nextCheckAt: repositoryScanState.nextCheckAt,
      owner: repositoryScanState.owner,
      repo: repositoryScanState.repo,
      repoUrl: repositoryScanState.repoUrl,
      status: repositoryScanState.status,
    })
    .from(repositoryScanState)
    .where(inArray(repositoryScanState.owner, owners)) as Promise<
    RepositoryScanStateRecord[]
  >;
}

export async function insertSyncRun(
  db: Database,
  syncRun: SyncRunRecord,
): Promise<number> {
  const [row] = await db
    .insert(syncRuns)
    .values({
      cron: syncRun.cron,
      durationMs: syncRun.durationMs,
      errorMessage: syncRun.errorMessage,
      executionPath: syncRun.executionPath ?? "single-run",
      finishedAt: syncRun.finishedAt,
      lastCheckpointJson: syncRun.lastCheckpointJson,
      mode: syncRun.mode,
      planningKey: syncRun.planningKey ?? null,
      plannedOwnerCount: syncRun.plannedOwnerCount,
      plannedRepoCount: syncRun.plannedRepoCount,
      processedOwnerCount: syncRun.processedOwnerCount,
      processedRepoCount: syncRun.processedRepoCount,
      rateLimitSnapshotJson: syncRun.rateLimitSnapshotJson,
      rateLimitedUntil: syncRun.rateLimitedUntil,
      reposDeferredByRateLimit: syncRun.reposDeferredByRateLimit,
      startedAt: syncRun.startedAt,
      status: syncRun.status,
      summaryJson: syncRun.summaryJson,
    })
    .returning({ id: syncRuns.id });

  if (!row) {
    throw new Error("Failed to insert sync run");
  }

  return row.id;
}

type SyncRunRow = typeof syncRuns.$inferSelect;
type SyncRunJobRow = typeof syncRunJobs.$inferSelect;

export async function getLatestSyncRun(
  db: Database,
): Promise<SyncRunRow | null> {
  return (
    (await db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(1))[0] ??
    null
  );
}

export async function listLatestSyncRuns(
  db: Database,
  limit: number,
): Promise<SyncRunRow[]> {
  return db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(limit);
}

export async function getSyncRunByPlanningKey(
  db: Database,
  planningKey: string,
): Promise<SyncRunRow | null> {
  return (
    (
      await db
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.planningKey, planningKey))
        .limit(1)
    )[0] ?? null
  );
}

export async function acquireSyncPlannerLock(
  db: Database,
  options: {
    acquiredAt: string;
    correlationId: string;
    expiresAt: string;
    name: string;
    runId: string;
  },
): Promise<boolean> {
  const existingLock = (
    await db
      .select()
      .from(syncPlannerLocks)
      .where(eq(syncPlannerLocks.name, options.name))
      .limit(1)
  )[0];

  if (existingLock && existingLock.expiresAt > options.acquiredAt) {
    return false;
  }

  if (existingLock) {
    await db
      .delete(syncPlannerLocks)
      .where(eq(syncPlannerLocks.name, options.name));
  }

  try {
    await db.insert(syncPlannerLocks).values(options);
    return true;
  } catch {
    return false;
  }
}

export async function releaseSyncPlannerLock(
  db: Database,
  name: string,
): Promise<void> {
  await db.delete(syncPlannerLocks).where(eq(syncPlannerLocks.name, name));
}

export async function insertSyncRunPhase(
  db: Database,
  phase: {
    errorCount?: number;
    finishedAt?: string | null;
    phase: string;
    runId: string;
    startedAt?: string | null;
    status: string;
    summaryJson?: string | null;
  },
): Promise<void> {
  await db.insert(syncRunPhases).values({
    errorCount: phase.errorCount ?? 0,
    finishedAt: phase.finishedAt ?? null,
    phase: phase.phase,
    runId: phase.runId,
    startedAt: phase.startedAt ?? null,
    status: phase.status,
    summaryJson: phase.summaryJson ?? null,
  });
}

export async function upsertSyncRunJob(
  db: Database,
  options: {
    message: QueueMessageBody;
    queuedAt: string;
    replayOfJobId?: string | null;
  },
): Promise<{ created: boolean; job: SyncRunJobRow }> {
  const id = buildQueueJobId(options.message);
  const semanticKey = buildQueueSemanticKey(options.message);
  const existingActiveJob = (
    await db
      .select()
      .from(syncRunJobs)
      .where(
        and(
          eq(syncRunJobs.semanticKey, semanticKey),
          inArray(syncRunJobs.status, ACTIVE_QUEUE_JOB_STATUSES),
        ),
      )
      .limit(1)
  )[0];

  if (existingActiveJob) {
    return { created: false, job: existingActiveJob };
  }

  const existingJob = (
    await db.select().from(syncRunJobs).where(eq(syncRunJobs.id, id)).limit(1)
  )[0];

  if (existingJob) {
    return { created: false, job: existingJob };
  }

  await db.insert(syncRunJobs).values({
    correlationId: options.message.correlationId,
    id,
    kind: options.message.kind,
    mode: options.message.mode,
    owner: options.message.owner,
    payloadJson: JSON.stringify(options.message),
    queuedAt: options.queuedAt,
    repo: "repo" in options.message ? options.message.repo : null,
    repoUrl: "repoUrl" in options.message ? options.message.repoUrl : null,
    replayOfJobId: options.replayOfJobId ?? null,
    runId: options.message.runId,
    schemaVersion: options.message.schemaVersion,
    semanticKey,
    status: "queued",
    updatedAt: options.queuedAt,
  });

  const createdJob = (
    await db.select().from(syncRunJobs).where(eq(syncRunJobs.id, id)).limit(1)
  )[0];

  if (!createdJob) {
    throw new Error(`Failed to insert queue job ${id}`);
  }

  return { created: true, job: createdJob };
}

async function getSyncRunJobById(
  db: Database,
  id: string,
): Promise<SyncRunJobRow | null> {
  return (
    (
      await db.select().from(syncRunJobs).where(eq(syncRunJobs.id, id)).limit(1)
    )[0] ?? null
  );
}

export async function markSyncRunJobProcessing(
  db: Database,
  id: string,
  startedAt: string,
): Promise<void> {
  const job = await getSyncRunJobById(db, id);

  await db
    .update(syncRunJobs)
    .set({
      attemptCount: (job?.attemptCount ?? 0) + 1,
      firstAttemptAt: job?.firstAttemptAt ?? startedAt,
      startedAt,
      status: "processing",
      updatedAt: startedAt,
    })
    .where(eq(syncRunJobs.id, id));
}

export async function markSyncRunJobSucceeded(
  db: Database,
  id: string,
  finishedAt: string,
): Promise<void> {
  await db
    .update(syncRunJobs)
    .set({
      finishedAt,
      lastError: null,
      lastErrorKind: null,
      lastErrorStage: null,
      status: "succeeded",
      updatedAt: finishedAt,
    })
    .where(eq(syncRunJobs.id, id));
}

export async function markSyncRunJobDeferred(
  db: Database,
  options: { finishedAt: string; id: string; rateLimitedUntil: string | null },
): Promise<void> {
  await db
    .update(syncRunJobs)
    .set({
      finishedAt: options.finishedAt,
      rateLimitedUntil: options.rateLimitedUntil,
      status: "deferred",
      updatedAt: options.finishedAt,
    })
    .where(eq(syncRunJobs.id, options.id));
}

export async function markSyncRunJobFailed(
  db: Database,
  options: {
    errorKind: string;
    errorMessage: string;
    errorStage: string;
    finishedAt: string;
    id: string;
  },
): Promise<void> {
  await db
    .update(syncRunJobs)
    .set({
      finishedAt: options.finishedAt,
      lastError: options.errorMessage,
      lastErrorKind: options.errorKind,
      lastErrorStage: options.errorStage,
      status: "failed",
      updatedAt: options.finishedAt,
    })
    .where(eq(syncRunJobs.id, options.id));
}

export async function getSyncRunJob(
  db: Database,
  id: string,
): Promise<SyncRunJobRow | null> {
  return getSyncRunJobById(db, id);
}

export async function getLatestSyncRunJobByStatus(
  db: Database,
  status: QueueJobStatus,
): Promise<SyncRunJobRow | null> {
  return (
    (
      await db
        .select()
        .from(syncRunJobs)
        .where(eq(syncRunJobs.status, status))
        .orderBy(desc(syncRunJobs.updatedAt))
        .limit(1)
    )[0] ?? null
  );
}

export async function listSyncRunJobCounts(
  db: Database,
  runId: string,
): Promise<Array<{ count: number; kind: string; status: string }>> {
  return db
    .select({
      count: count(),
      kind: syncRunJobs.kind,
      status: syncRunJobs.status,
    })
    .from(syncRunJobs)
    .where(eq(syncRunJobs.runId, runId))
    .groupBy(syncRunJobs.kind, syncRunJobs.status)
    .orderBy(syncRunJobs.kind, syncRunJobs.status);
}

export async function listActiveOrProblemSyncRunJobs(
  db: Database,
  limit: number,
): Promise<SyncRunJobRow[]> {
  return db
    .select()
    .from(syncRunJobs)
    .where(
      inArray(syncRunJobs.status, [
        "queued",
        "processing",
        "deferred",
        "failed",
      ]),
    )
    .orderBy(desc(syncRunJobs.updatedAt), syncRunJobs.id)
    .limit(limit);
}

export async function listLatestProjectsByFirstSeen(
  db: Database,
  limit: number,
): Promise<
  Array<{
    firstSeenAt: string;
    lastSeenAt: string;
    owner: string;
    repo: string;
    repoCreatedAt: string | null;
    slug: string;
  }>
> {
  return db
    .select({
      firstSeenAt: projects.firstSeenAt,
      lastSeenAt: projects.lastSeenAt,
      owner: projects.owner,
      repo: projects.repo,
      repoCreatedAt: projects.repoCreatedAt,
      slug: projects.slug,
    })
    .from(projects)
    .orderBy(desc(projects.firstSeenAt), desc(projects.repoCreatedAt))
    .limit(limit);
}

export async function finalizeSyncRunFromJobs(
  db: Database,
  options: { finishedAt: string; runId: string },
): Promise<{
  counts: Array<{ count: number; kind: string; status: string }>;
  status: "partial" | "processing" | "succeeded";
}> {
  const counts = await listSyncRunJobCounts(db, options.runId);
  const activeCount = counts
    .filter((row) => row.status === "processing" || row.status === "queued")
    .reduce((total, row) => total + row.count, 0);
  const problemCount = counts
    .filter((row) => row.status === "deferred" || row.status === "failed")
    .reduce((total, row) => total + row.count, 0);
  const status =
    activeCount > 0 ? "processing" : problemCount > 0 ? "partial" : "succeeded";
  const processedOwnerCount = counts
    .filter(
      (row) =>
        row.kind === "scan-owner" &&
        ["cancelled", "deferred", "failed", "succeeded"].includes(row.status),
    )
    .reduce((total, row) => total + row.count, 0);
  const processedRepoCount = counts
    .filter(
      (row) =>
        row.kind !== "scan-owner" &&
        ["cancelled", "deferred", "failed", "succeeded"].includes(row.status),
    )
    .reduce((total, row) => total + row.count, 0);
  const reposDeferredByRateLimit = counts
    .filter((row) => row.kind !== "scan-owner" && row.status === "deferred")
    .reduce((total, row) => total + row.count, 0);
  const plannedRepoCount = counts
    .filter((row) => row.kind !== "scan-owner")
    .reduce((total, row) => total + row.count, 0);

  await db
    .update(syncRuns)
    .set({
      finishedAt: options.finishedAt,
      plannedRepoCount,
      processedOwnerCount,
      processedRepoCount,
      reposDeferredByRateLimit,
      status,
      summaryJson: JSON.stringify({ jobCounts: counts }),
    })
    .where(eq(syncRuns.id, Number.parseInt(options.runId, 10)));

  return { counts, status };
}

export async function reactivateSyncRunJobForReplay(
  db: Database,
  options: { id: string; replayedAt: string },
): Promise<void> {
  await db
    .update(syncRunJobs)
    .set({
      finishedAt: null,
      lastError: null,
      lastErrorKind: null,
      lastErrorStage: null,
      rateLimitedUntil: null,
      replayOfJobId: options.id,
      startedAt: null,
      status: "queued",
      updatedAt: options.replayedAt,
    })
    .where(eq(syncRunJobs.id, options.id));
}

export async function listDueDeferredSyncRunJobs(
  db: Database,
  now: string,
): Promise<SyncRunJobRow[]> {
  return db
    .select()
    .from(syncRunJobs)
    .where(
      and(
        eq(syncRunJobs.status, "deferred"),
        isNotNull(syncRunJobs.rateLimitedUntil),
        lte(syncRunJobs.rateLimitedUntil, now),
      ),
    )
    .orderBy(syncRunJobs.rateLimitedUntil, syncRunJobs.id);
}

export async function requeueSyncRunJob(
  db: Database,
  options: { id: string; queuedAt: string },
): Promise<void> {
  await db
    .update(syncRunJobs)
    .set({
      finishedAt: null,
      rateLimitedUntil: null,
      startedAt: null,
      status: "queued",
      updatedAt: options.queuedAt,
    })
    .where(eq(syncRunJobs.id, options.id));
}

export async function getLatestFailedSyncRun(
  db: Database,
): Promise<SyncRunRow | null> {
  return (
    (
      await db
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.status, "failed"))
        .orderBy(desc(syncRuns.id))
        .limit(1)
    )[0] ?? null
  );
}

export async function getLatestRateLimitedSyncRun(
  db: Database,
): Promise<SyncRunRow | null> {
  return (
    (
      await db
        .select()
        .from(syncRuns)
        .where(
          or(
            gt(syncRuns.reposDeferredByRateLimit, 0),
            isNotNull(syncRuns.rateLimitedUntil),
          ),
        )
        .orderBy(desc(syncRuns.id))
        .limit(1)
    )[0] ?? null
  );
}

export async function getSyncState(
  db: Database,
  mode: SyncStateRecord["mode"],
): Promise<SyncStateRecord | null> {
  const row = await db
    .select({
      checkpointJson: syncState.checkpointJson,
      mode: syncState.mode,
      nextOwnerCursor: syncState.nextOwnerCursor,
      pendingRepositoryUrlsJson: syncState.pendingRepositoryUrlsJson,
      updatedAt: syncState.updatedAt,
    })
    .from(syncState)
    .where(eq(syncState.mode, mode))
    .limit(1);

  if (!row[0]) {
    return null;
  }

  return {
    ...row[0],
    mode,
  };
}

export async function upsertSyncState(
  db: Database,
  state: SyncStateRecord,
): Promise<void> {
  await db
    .insert(syncState)
    .values({
      checkpointJson: state.checkpointJson,
      mode: state.mode,
      nextOwnerCursor: state.nextOwnerCursor,
      pendingRepositoryUrlsJson: state.pendingRepositoryUrlsJson,
      updatedAt: state.updatedAt,
    })
    .onConflictDoUpdate({
      target: syncState.mode,
      set: {
        checkpointJson: state.checkpointJson,
        nextOwnerCursor: state.nextOwnerCursor,
        pendingRepositoryUrlsJson: state.pendingRepositoryUrlsJson,
        updatedAt: state.updatedAt,
      },
    });
}

export async function getGitHubResponseCache(
  db: Database,
  requestUrl: string,
): Promise<GitHubResponseCacheRecord | null> {
  const rows = await db
    .select({
      etag: githubResponseCache.etag,
      fetchedAt: githubResponseCache.fetchedAt,
      lastModified: githubResponseCache.lastModified,
      linkHeader: githubResponseCache.linkHeader,
      requestUrl: githubResponseCache.requestUrl,
      responseBody: githubResponseCache.responseBody,
    })
    .from(githubResponseCache)
    .where(eq(githubResponseCache.requestUrl, requestUrl))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertGitHubResponseCache(
  db: Database,
  cacheEntry: GitHubResponseCacheRecord,
): Promise<void> {
  await db
    .insert(githubResponseCache)
    .values({
      etag: cacheEntry.etag,
      fetchedAt: cacheEntry.fetchedAt,
      lastModified: cacheEntry.lastModified,
      linkHeader: cacheEntry.linkHeader,
      requestUrl: cacheEntry.requestUrl,
      responseBody: cacheEntry.responseBody,
    })
    .onConflictDoUpdate({
      target: githubResponseCache.requestUrl,
      set: {
        etag: cacheEntry.etag,
        fetchedAt: cacheEntry.fetchedAt,
        lastModified: cacheEntry.lastModified,
        linkHeader: cacheEntry.linkHeader,
        responseBody: cacheEntry.responseBody,
      },
    });
}
