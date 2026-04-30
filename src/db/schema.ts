import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable(
  "projects",
  {
    slug: text("slug").primaryKey(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    repoUrl: text("repo_url").notNull(),
    repoCreationOrder: integer("repo_creation_order"),
    repoCreatedAt: text("repo_created_at"),
    homepageUrl: text("homepage_url"),
    branch: text("branch").notNull(),
    wranglerPath: text("wrangler_path").notNull(),
    wranglerFormat: text("wrangler_format").notNull(),
    readmeMarkdown: text("readme_markdown").notNull(),
    readmePreviewMarkdown: text("readme_preview_markdown").notNull(),
    previewImageUrl: text("preview_image_url"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => ({
    ownerRepoUnique: uniqueIndex("projects_owner_repo_unique").on(
      table.owner,
      table.repo,
    ),
  }),
);

export const projectProducts = sqliteTable(
  "project_products",
  {
    projectSlug: text("project_slug")
      .notNull()
      .references(() => projects.slug, { onDelete: "cascade" }),
    productKey: text("product_key").notNull(),
    productLabel: text("product_label").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectSlug, table.productKey] }),
  }),
);

export const repositoryScanState = sqliteTable(
  "repository_scan_state",
  {
    repoUrl: text("repo_url").primaryKey(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    status: text("status").notNull(),
    lastCheckedAt: text("last_checked_at").notNull(),
    nextCheckAt: text("next_check_at").notNull(),
  },
  (table) => ({
    nextCheckIdx: index("repository_scan_state_next_check_idx").on(
      table.nextCheckAt,
    ),
  }),
);

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cron: text("cron").notNull(),
    durationMs: integer("duration_ms").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    plannedOwnerCount: integer("planned_owner_count").notNull(),
    processedOwnerCount: integer("processed_owner_count").notNull(),
    plannedRepoCount: integer("planned_repo_count").notNull(),
    processedRepoCount: integer("processed_repo_count").notNull(),
    lastCheckpointJson: text("last_checkpoint_json"),
    rateLimitSnapshotJson: text("rate_limit_snapshot_json"),
    reposDeferredByRateLimit: integer("repos_deferred_by_rate_limit").notNull(),
    rateLimitedUntil: text("rate_limited_until"),
    summaryJson: text("summary_json"),
    errorMessage: text("error_message"),
    executionPath: text("execution_path").notNull().default("single-run"),
    planningKey: text("planning_key"),
  },
  (table) => ({
    planningKeyUnique: uniqueIndex("sync_runs_planning_key_unique").on(
      table.planningKey,
    ),
    startedAtIdx: index("sync_runs_started_at_idx").on(table.startedAt),
  }),
);

export const syncRunJobs = sqliteTable(
  "sync_run_jobs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    semanticKey: text("semantic_key").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    kind: text("kind").notNull(),
    mode: text("mode").notNull(),
    owner: text("owner").notNull(),
    repo: text("repo"),
    repoUrl: text("repo_url"),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    firstAttemptAt: text("first_attempt_at"),
    lastError: text("last_error"),
    lastErrorStage: text("last_error_stage"),
    lastErrorKind: text("last_error_kind"),
    payloadJson: text("payload_json").notNull(),
    queuedAt: text("queued_at").notNull(),
    replayOfJobId: text("replay_of_job_id"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    rateLimitedUntil: text("rate_limited_until"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    runStatusIdx: index("sync_run_jobs_run_status_idx").on(
      table.runId,
      table.status,
    ),
    semanticStatusIdx: index("sync_run_jobs_semantic_status_idx").on(
      table.semanticKey,
      table.status,
    ),
  }),
);

export const syncRunPhases = sqliteTable(
  "sync_run_phases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    phase: text("phase").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    errorCount: integer("error_count").notNull().default(0),
    summaryJson: text("summary_json"),
  },
  (table) => ({
    runPhaseIdx: index("sync_run_phases_run_phase_idx").on(
      table.runId,
      table.phase,
    ),
  }),
);

export const syncPlannerLocks = sqliteTable("sync_planner_locks", {
  name: text("name").primaryKey(),
  runId: text("run_id").notNull(),
  correlationId: text("correlation_id").notNull(),
  acquiredAt: text("acquired_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const syncState = sqliteTable("sync_state", {
  mode: text("mode").primaryKey(),
  nextOwnerCursor: integer("next_owner_cursor").notNull(),
  pendingRepositoryUrlsJson: text("pending_repository_urls_json").notNull(),
  checkpointJson: text("checkpoint_json"),
  updatedAt: text("updated_at").notNull(),
});

export const githubResponseCache = sqliteTable("github_response_cache", {
  requestUrl: text("request_url").primaryKey(),
  etag: text("etag"),
  lastModified: text("last_modified"),
  linkHeader: text("link_header"),
  responseBody: text("response_body").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});
