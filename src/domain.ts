import type { CloudflareProduct } from "./lib/wrangler/parse";

export type AppEnv = {
  DB: D1Database;
  APP_NAME: string;
  DEBUG_SYNC_TOKEN?: string;
  ENABLE_DEBUG_ROUTES?: string;
  GITHUB_TOKEN?: string;
};

export type SyncSummary = {
  accountsScanned: number;
  reposAdded: number;
  reposDiscovered: number;
  reposInvalidConfig: number;
  reposRemoved: number;
  reposSkippedTransiently: number;
  reposUpdated: number;
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
