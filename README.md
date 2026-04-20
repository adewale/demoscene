# demoscene

Public Cloudflare app that turns a source-controlled list of team GitHub accounts into a reverse-chronological feed of Cloudflare projects.

## Chosen Stack

- TypeScript
- Cloudflare Workers
- Hono
- React SSR
- D1
- Drizzle ORM
- `react-markdown` with sanitization
- Vitest
- React Testing Library
- `@cloudflare/vitest-pool-workers`
- Playwright
- `fast-check`

## Scope

- run a scheduled sync every day at `12:00 UTC`
- read a source-controlled list of public GitHub team accounts
- use the GitHub REST API for repository discovery and repository metadata
- use `GITHUB_TOKEN` for higher GitHub API limits in deployed environments
- treat a repo as a Cloudflare project if it has a top-level `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`
- infer Cloudflare products from that Wrangler config and show them as icons on feed cards
- fetch and store the repo README once
- derive a bounded README preview once and render the first 2 cleaned preview paragraphs on feed cards
- normalize README heading syntax into body text during preview derivation
- make the main card link go to the GitHub repo
- group the feed by newest day first using `repoCreatedAt`, with `firstSeenAt` as a fallback
- remove a repo from the site if it can no longer be found

## Routes

- `/`
- `/?page=:n`
- `/feed.json`
- `/rss.xml`
- `/projects/:owner/:repo.json`
- `/debug/sync` for local/manual verification when debug access is allowed
- `/robots.txt`
- `/sitemap.xml`

## Fetch Rules

For each team account, repository discovery uses the GitHub REST API:

- `GET /users/:login/repos?sort=created&direction=desc&per_page=100&page=:n`
- continue paging while the GitHub `Link` header exposes `rel="next"`

For each discovered repo `https://github.com/:owner/:repo`:

- fetch repository metadata from `GET /repos/:owner/:repo`
- prefer the repo's actual `default_branch` when fetching raw files, then fall back to `main` and `master`
- README URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/README.md`
  - `https://raw.githubusercontent.com/:owner/:repo/main/README.md`
  - `https://raw.githubusercontent.com/:owner/:repo/master/README.md`
- top-level Wrangler URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/:default_branch/wrangler.jsonc`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.jsonc`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.jsonc`
- homepage is extracted from the public repo page HTML at `https://github.com/:owner/:repo`
- preview images are best-effort metadata from the repo page and transient validation failures do not block sync

## Sync Observability

- scheduled runs emit a sync summary to logs
- the summary includes accounts scanned and repos discovered, added, updated, removed, invalid-config, and skipped-transiently counts
- `GET /debug/sync` runs a manual sync and returns the same summary JSON when either:
  - the app is running on `localhost` or `127.0.0.1`
  - `ENABLE_DEBUG_ROUTES === "true"` and `x-debug-sync-token` matches `DEBUG_SYNC_TOKEN`

## Local Development

- `npm run db:migrate:local` applies D1 migrations to the local database
- `npm run test:fast` runs format, lint, typecheck, unit tests, and worker tests
- `npm run test:full` runs the full verification suite, including E2E, coverage, audits, duplicate-code detection, and secrets scanning
- `wrangler.jsonc` uses a separate `preview_database_id` from production

## Feed Model

- the homepage is the product; it is not a replacement for GitHub
- the latest day stays at the top of the feed
- cards within a day are ordered newest-first by `repoCreatedAt`, then `repoCreationOrder`, then `firstSeenAt`
- the main card link goes to the GitHub repository
- cards show the first 2 cleaned preview paragraphs, not the full README
- cards do not show a `Live` pill; only non-GitHub supplementary actions such as `Video` remain
- `/projects/:owner/:repo.json` exists for machine consumers only

## Docs

- spec: `specs/demoscene_spec.md`
- architecture: `specs/architecture.md`
- roadmap: `specs/roadmap.md`
- stack: `specs/stack.md`
