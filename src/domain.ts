import type { CloudflareProduct } from "./lib/wrangler/parse";

export type RepositoryScanStatus = "ignored" | "invalid_config";
export type SyncMode = "incremental" | "reconcile";

export type GitHubResponseCacheRecord = {
  etag: string | null;
  fetchedAt: string;
  lastModified: string | null;
  linkHeader: string | null;
  requestUrl: string;
  responseBody: string;
};

export type AppEnv = {
  DB: D1Database;
  APP_NAME: string;
  DEBUG_SYNC_TOKEN?: string;
  ENABLE_DEBUG_ROUTES?: string;
  GITHUB_TOKEN?: string;
  OWNER_QUEUE?: Queue<unknown>;
  QUEUE_SYNC_ENABLED?: string;
  REPO_QUEUE?: Queue<unknown>;
};

export type SyncSummary = {
  accountsScanned: number;
  accountsFailed: number;
  accountsSucceeded: number;
  reposAdded: number;
  reposDeferredByRateLimit: number;
  reposDiscovered: number;
  reposInvalidConfig: number;
  reposRemoved: number;
  reposSkippedTransiently: number;
  reposUpdated: number;
  rateLimitedUntil: string | null;
};

export type SyncRunRecord = {
  cron: string;
  durationMs: number;
  errorMessage: string | null;
  finishedAt: string;
  lastCheckpointJson: string | null;
  mode: SyncMode;
  plannedOwnerCount: number;
  plannedRepoCount: number;
  processedOwnerCount: number;
  processedRepoCount: number;
  rateLimitSnapshotJson: string | null;
  rateLimitedUntil: string | null;
  reposDeferredByRateLimit: number;
  startedAt: string;
  executionPath?: "queue" | "single-run";
  planningKey?: string | null;
  status: "failed" | "partial" | "processing" | "queued" | "succeeded";
  summaryJson: string | null;
};

export type SyncStateRecord = {
  checkpointJson: string | null;
  mode: SyncMode;
  nextOwnerCursor: number;
  pendingRepositoryUrlsJson: string;
  updatedAt: string;
};

export type ProjectRecord = {
  slug: string;
  owner: string;
  repo: string;
  repoUrl: string;
  repoCreationOrder: number;
  repoCreatedAt: string;
  homepageUrl: string | null;
  branch: string;
  wranglerPath: string;
  wranglerFormat: string;
  readmeMarkdown: string;
  readmePreviewMarkdown: string;
  previewImageUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ProjectWithProducts = ProjectRecord & {
  products: CloudflareProduct[];
};

export type RepositoryScanStateRecord = {
  owner: string;
  repo: string;
  repoUrl: string;
  status: RepositoryScanStatus;
  lastCheckedAt: string;
  nextCheckAt: string;
};
