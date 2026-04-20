DELETE FROM project_products;
DELETE FROM projects;

INSERT INTO projects (
  slug,
  owner,
  repo,
  repo_url,
  repo_creation_order,
  repo_created_at,
  homepage_url,
  branch,
  wrangler_path,
  wrangler_format,
  readme_markdown,
  readme_preview_markdown,
  preview_image_url,
  first_seen_at,
  last_seen_at
) VALUES (
  'acme/demo-scene',
  'acme',
  'demo-scene',
  'https://github.com/acme/demo-scene',
  42,
  '2026-04-14T12:00:00.000Z',
  'https://demo.example.com',
  'main',
  'wrangler.toml',
  'toml',
  '# Demo Scene\n\nThis project shows a card-oriented feed.\n\n[Watch demo](https://www.loom.com/share/demo-scene)',
  '# Demo Scene\n\nThis project shows a card-oriented feed.\n\n[Watch demo](https://www.loom.com/share/demo-scene)',
  'https://images.example.com/demo-scene.png',
  '2026-04-14T12:00:00.000Z',
  '2026-04-14T12:00:00.000Z'
);

INSERT INTO project_products (project_slug, product_key, product_label) VALUES
  ('acme/demo-scene', 'workers', 'Workers'),
  ('acme/demo-scene', 'd1', 'D1');
