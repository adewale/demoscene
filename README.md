# demoscene

Public Cloudflare app that turns a source-controlled list of team GitHub accounts into a feed of Cloudflare projects.

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
- do not use auth
- do not use the GitHub API
- discover public repos from each team member's GitHub repositories page
- treat a repo as a Cloudflare project if it has a top-level `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`
- infer Cloudflare products from that Wrangler config and show them as icons on feed cards
- fetch and store the repo README once
- render the first 2 README paragraphs on feed cards
- make the main card link go to the GitHub repo
- remove a repo from the site if it can no longer be found

## Routes

- `/`
- `/feed.json`
- `/rss.xml`
- `/projects/:owner/:repo.json`
- `/debug/sync` for local/manual verification
- `/robots.txt`
- `/sitemap.xml`

## Fetch Rules

For each team account `https://github.com/:owner?tab=repositories`:

- fetch public repository listing pages directly from GitHub HTML
- discover repository URLs without the GitHub API

For each discovered repo URL `https://github.com/:owner/:repo`:

- try branch `main` first, then `master`
- README URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/main/README.md`
  - `https://raw.githubusercontent.com/:owner/:repo/master/README.md`
- top-level Wrangler URLs:
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.toml`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.json`
  - `https://raw.githubusercontent.com/:owner/:repo/main/wrangler.jsonc`
  - `https://raw.githubusercontent.com/:owner/:repo/master/wrangler.jsonc`
- homepage is extracted from the public repo page HTML at `https://github.com/:owner/:repo`

## Sync Observability

- scheduled runs emit a sync summary to logs
- the summary includes accounts scanned and repos discovered, added, updated, removed, and skipped transiently
- `GET /debug/sync` runs a manual sync and returns the same summary JSON when debug routes are enabled or the app is running on `localhost` / `127.0.0.1`

## Feed Model

- the homepage is the product; it is not a replacement for GitHub
- the main card link goes to the GitHub repository
- cards show the first 2 README paragraphs, not the full README
- `/projects/:owner/:repo.json` exists for machine consumers only

## Docs

- spec: `specs/demoscene_spec.md`
- architecture: `specs/architecture.md`
- roadmap: `specs/roadmap.md`
- stack: `specs/stack.md`
