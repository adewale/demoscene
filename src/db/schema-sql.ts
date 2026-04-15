export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  slug TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  homepage_url TEXT,
  branch TEXT NOT NULL,
  wrangler_path TEXT NOT NULL,
  wrangler_format TEXT NOT NULL,
  readme_markdown TEXT NOT NULL,
  readme_preview_markdown TEXT NOT NULL,
  preview_image_url TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_owner_repo_unique ON projects(owner, repo);

CREATE TABLE IF NOT EXISTS project_products (
  project_slug TEXT NOT NULL,
  product_key TEXT NOT NULL,
  product_label TEXT NOT NULL,
  PRIMARY KEY (project_slug, product_key),
  FOREIGN KEY (project_slug) REFERENCES projects(slug) ON DELETE CASCADE
);
`;
