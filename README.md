# demoscene

Public Cloudflare app that turns a source-controlled list of public GitHub repos into a feed of Cloudflare projects.

## Chosen Stack

- TypeScript
- Cloudflare Workers
- Hono
- React SSR
- D1
- Drizzle
- `react-markdown` with sanitization
- Vitest
- React Testing Library
- `@cloudflare/vitest-pool-workers`
- Playwright
- `fast-check`

## Scope

- run a scheduled sync every day at `12:00 UTC`
- read a source-controlled list of public GitHub repo URLs
- do not use auth
- do not use the GitHub API
- treat a repo as a Cloudflare project if it has a top-level `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`
- infer Cloudflare products from that Wrangler config and show them as icons on feed cards
- fetch and store the repo README once
- render a bounded Markdown preview on feed cards and the full Markdown on project pages
- link each project to the repo homepage
- remove a repo from the site if it can no longer be found

## Routes

- `/`
- `/projects/:owner/:repo`
- `/feed.json`
- `/projects/:owner/:repo.json`
- `/robots.txt`
- `/sitemap.xml`

## Fetch Rules

For each repo URL `https://github.com/:owner/:repo`:

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

## Docs

- spec: `specs/demoscene_spec.md`
- architecture: `specs/architecture.md`
- roadmap: `specs/roadmap.md`
- stack: `specs/stack.md`
