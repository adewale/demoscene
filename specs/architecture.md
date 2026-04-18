# Architecture

## Overview

Smallest concrete architecture:

- one Cloudflare Worker
- Hono for routing
- React SSR for HTML pages
- one scheduled handler
- one D1 database
- one source-controlled team account list in the codebase
- Drizzle for schema and query typing

The Worker does two jobs:

- scheduled sync of GitHub repos into D1
- public read routes for the feed and project pages

## Components

### Source list

- a file in the repo contains the canonical list of public GitHub team accounts
- the sync discovers public repos for those accounts from GitHub HTML

### Sync worker

Runs every day at `12:00 UTC`.

For each sync run:

1. Fetch each configured team account's public repositories pages.
2. Discover repo URLs from those HTML pages.
3. Union those repo URLs with already-known projects for the tracked team, so removals and refreshes are still checked.
4. Parse `owner` and `repo` from each repo URL.
5. Fetch the public repo page HTML.
6. If the repo page is missing, remove the repo from D1 and from the public site.
7. Extract the repo homepage from the repo page HTML.
8. Try the top-level Wrangler config URLs in a fixed order.
9. If no top-level Wrangler config exists, the repo is not shown in the site.
10. If a Wrangler config exists and the repo is new, fetch the README and derive a bounded Markdown preview for feed cards.
11. Infer Cloudflare products from the Wrangler config.
12. Create or update the project record.
13. Refresh homepage and preview media metadata on later runs.
14. Ignore later README changes.
15. Continue processing other repos even if one repo or account fails.

## Fetch Strategy

No GitHub API is used.

For each team account `https://github.com/:owner?tab=repositories`:

- fetch paginated repositories pages directly from GitHub HTML
- discover repo URLs from repository anchors in that HTML

For each discovered repo URL `https://github.com/:owner/:repo`:

- check branch `main` first, then `master`
- try these README URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/main/README.md`
  - `https://raw.githubusercontent.com/:owner/:repo/master/README.md`
- try these top-level Wrangler URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.jsonc`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.jsonc`

Only the top-level Wrangler config counts. Nested configs in monorepos are ignored.

## Product Inference

Cloudflare product metadata is inferred from the top-level Wrangler config only.

Initial mapping should cover clear bindings and features such as:

- Workers
- Pages
- D1
- KV
- R2
- Durable Objects
- Queues
- Workflows
- Vectorize
- AI

This metadata powers icons on feed cards and project pages.

Inference is best-effort metadata, not a guarantee that every configured product is actively used at runtime.

## Storage

Use D1.

Suggested tables:

### `projects`

- `owner`
- `repo`
- `repo_url`
- `homepage_url`
- `slug`
- `branch`
- `wrangler_path`
- `wrangler_format`
- `readme_markdown`
- `readme_preview_markdown`
- `preview_image_url`
- `first_seen_at`
- `last_seen_at`

### `project_products`

- `project_slug`
- `product_key`
- `product_label`

This keeps the read side simple and makes icon rendering deterministic.

## Rendering

- Hono serves JSON routes and React SSR HTML routes from the same Worker
- store README as Markdown
- store a bounded Markdown preview for feed cards
- render Markdown to sanitized HTML with React components for the public site
- use the stored homepage URL as the main external project link
- show preview media only when available

## UI Components

Suggested React component structure:

- `AppShell`
- `FeedPage`
- `FeedGrid`
- `ProjectCard`
- `ProductIconStrip`
- `ProjectMetaRow`
- `MarkdownPreview`
- `PreviewMedia`
- `ProjectDetailPage`
- `MarkdownDocument`

The feed page should stay card-oriented and scannable. The detail page should show the full project record.

## Routes

### Public HTML

- `/` renders the feed
- `/projects/:owner/:repo` renders a persistent project page

### Public JSON

- `/feed.json` returns the feed payload
- `/projects/:owner/:repo.json` returns one project payload

Both JSON routes should expose the full Markdown and the bounded preview needed by the React UI.

### Support

- `/robots.txt`
- `/sitemap.xml`

## UI Notes

- warm off-white background
- dark warm text
- Cloudflare orange accent
- rounded cards or pills with light borders
- restrained dashed dividers
- optional subtle dot-grid texture
- card-oriented feed layout with strong visual hierarchy
- product icon strip should be immediately legible before the Markdown preview

## Operational Rules

- newly discovered Cloudflare repos become feed entries
- README is fetched once on first discovery
- later README changes are ignored
- transient upstream failures do not remove existing projects or abort the full sync
- if a repo cannot be found, remove it from D1 and from the site
