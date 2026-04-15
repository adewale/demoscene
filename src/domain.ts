import type { CloudflareProduct } from "./lib/wrangler/parse";

export type AppEnv = {
  DB: D1Database;
  APP_NAME: string;
};

export type ProjectRecord = {
  slug: string;
  owner: string;
  repo: string;
  repoUrl: string;
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
