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
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    summaryJson: text("summary_json"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    startedAtIdx: index("sync_runs_started_at_idx").on(table.startedAt),
  }),
);
