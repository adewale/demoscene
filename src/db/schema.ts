import {
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
