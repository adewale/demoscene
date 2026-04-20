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
- public read routes for the feed and feed APIs

## Components

### Source list

- a file in the repo contains the canonical list of public GitHub team accounts
- the sync discovers public repos for those accounts from the GitHub REST API

### Sync worker

Runs every day at `12:00 UTC`.

For each sync run:

1. Fetch each configured team account's repositories from the GitHub REST API.
2. Continue paging while the GitHub `Link` header exposes `rel="next"`.
3. Add periodic stale-revisit candidates for tracked owners so older repos are eventually rechecked for removals and metadata drift.
4. Optionally prune projects whose owners are no longer in the tracked team list during full team syncs.
5. Parse `owner` and `repo` from each discovered repo URL.
6. Fetch repository metadata from `GET /repos/:owner/:repo`.
7. Fetch the public repo page HTML.
8. If the repo page is missing and the repo metadata endpoint also says not found, remove the repo from D1 and from the public site.
9. Extract homepage and preview-image candidates from the repo page HTML.
10. Try the top-level Wrangler config URLs in a fixed order, preferring the repo's actual default branch first.
11. If no top-level Wrangler config exists, the repo is not shown in the site.
12. If a Wrangler config exists and the repo is new, fetch the README and derive a bounded Markdown preview for feed cards.
13. Normalize Markdown headings into body text during preview derivation.
14. Infer Cloudflare products from the Wrangler config.
15. Create or update the project record, including `repoCreatedAt` and `repoCreationOrder`.
16. Refresh homepage and preview media metadata on later runs.
17. Ignore later README changes.
18. Continue processing other repos even if one repo or account fails.
19. Return and log a sync summary with counts for accounts scanned and repos discovered, added, updated, removed, invalid-config, and skipped-transiently.

## Fetch Strategy

GitHub repository discovery and metadata use the GitHub REST API.

For each team account:

- call `GET /users/:login/repos?sort=created&direction=desc&per_page=100&page=:n`
- continue paging while the `Link` header exposes `rel="next"`

For each discovered repo URL `https://github.com/:owner/:repo`:

- fetch `GET /repos/:owner/:repo` for `default_branch`, `created_at`, homepage, and repo `id`
- check the repo's default branch first, then `main`, then `master`
- try these README URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/README.md`
  - `https://raw.githubusercontent.com/:owner/:repo/main/README.md`
  - `https://raw.githubusercontent.com/:owner/:repo/master/README.md`
- try these top-level Wrangler URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/wrangler.jsonc`
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

This metadata powers icons on feed cards, feed JSON, and RSS output.

Inference is best-effort metadata, not a guarantee that every configured product is actively used at runtime.

## Storage

Use D1.

Suggested tables:

### `projects`

- `owner`
- `repo`
- `repo_url`
- `repo_creation_order`
- `repo_created_at`
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
- group the feed by newest day first using `repoCreatedAt` where available
- render Markdown to sanitized HTML with React components for the public site
- use the stored homepage URL as the main external project link
- show preview media when available and a stable fallback panel when it is not

## UI Components

Suggested React component structure:

- `AppShell`
- `FeedPage`
- `ProjectCard`
- `ProductIconStrip`
- `ProjectMetaRow`
- `MarkdownPreview`

The feed page should stay card-oriented and scannable. Machine consumers can use `/projects/:owner/:repo.json` for the full stored project record.

## Routes

### Public HTML

- `/` renders the feed
- there are no first-party HTML project pages; project titles link directly to GitHub

### Public JSON

- `/feed.json` returns the feed payload
- `/rss.xml` returns a rich RSS feed for external aggregators and readers
- `/projects/:owner/:repo.json` returns one project payload
- `/debug/sync` triggers a manual sync and returns the sync summary when debug routes are enabled and the caller supplies `x-debug-sync-token`, or when the app is running locally

Feed APIs should expose enough structured data for richer external consumers and debugging.

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
- cards should preserve layout with a preview fallback state when media is missing

## Operational Rules

- newly discovered Cloudflare repos become feed entries
- README is fetched once on first discovery
- later README changes are ignored
- feed chronology follows `repoCreatedAt`, then `repoCreationOrder`, then `firstSeenAt`
- transient upstream failures do not remove existing projects or abort the full sync
- preview-image validation failures do not block repo ingestion
- older tracked repos are periodically revisited so stale entries can be cleaned up
- if a repo cannot be found, remove it from D1 and from the site
