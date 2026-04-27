# demoscene

`demoscene` is a Cloudflare Worker that scans a curated set of GitHub accounts and publishes a reverse-chronological feed of public Cloudflare projects from the Cloudflare DevRel team.

It discovers repositories with the GitHub API, detects top-level Wrangler configs, stores the first README it sees, derives a cleaned preview for cards, and renders the result as HTML, JSON, and RSS.

## Live Surfaces

- Site: `https://demoscene.adewale-883.workers.dev/`
- JSON feed: `https://demoscene.adewale-883.workers.dev/feed.json`
- RSS feed: `https://demoscene.adewale-883.workers.dev/rss.xml`

## Features

- daily scheduled sync at `12:00 UTC`
- London schedule: `13:00` during BST and `12:00` during GMT
- GitHub API discovery with stable pagination handling
- resumable fair sync scheduling with rotating owner order and persisted partial-run checkpoints
- GitHub-first feed cards ordered by real repository creation time
- top-level Wrangler detection for `wrangler.toml`, `wrangler.json`, and `wrangler.jsonc`
- inferred Cloudflare product metadata on each card from Wrangler config and package heuristics
- conditional GitHub REST requests for cached repo discovery and metadata fetches
- cleaned README preview generation for feed cards, including heading, badge, and icon-strip cleanup
- machine-readable project JSON and RSS output
- durable scheduled run history plus protected operator debug tooling for latest, failed, and rate-limited runs
- committed offline corpus cache for future analysis

## Requirements

Runs entirely on the Cloudflare free tier for normal development and small-scale use.

You will still need:

- a Cloudflare account
- a GitHub personal access token for higher GitHub API limits

If Cloudflare pricing changes, double-check the current Workers and D1 limits before deploying at larger scale.

## Cloudflare Services

| Service       | Purpose                                       |
| ------------- | --------------------------------------------- |
| Workers       | App runtime, routing, SSR, and scheduled sync |
| D1            | Persistent project storage                    |
| Cron Triggers | Daily repository sync at `12:00 UTC`          |

## Getting Started

### 1. Install dependencies

```bash
npm install
npx playwright install
```

### 2. Create your Cloudflare D1 databases

Create one database for production data and one for preview/local preview data:

```bash
npx wrangler d1 create demoscene
npx wrangler d1 create demoscene-preview
```

Copy the returned `database_id` values into `wrangler.jsonc`:

- `database_id` for your main database
- `preview_database_id` for your preview database

### 3. Configure local secrets

Create a local `.dev.vars` file from the checked-in example:

```bash
cp .dev.vars.example .dev.vars
```

Set at least:

- `GITHUB_TOKEN` for GitHub API access

Optional local debug settings:

- `ENABLE_DEBUG_ROUTES=true`
- `DEBUG_SYNC_TOKEN=your-local-token`

### 4. Apply local migrations

```bash
npm run db:migrate:local
```

### 5. Start the app locally

```bash
npm run dev
```

The local app runs with Wrangler and serves the same routes as production.

## Fork And Deploy

### 1. Fork the repository

Fork this repo to your own GitHub account before deploying your own instance.

### 2. Create your own Cloudflare resources

Do not reuse the checked-in D1 IDs. Create your own databases and update `wrangler.jsonc` in your fork.

### 3. Set required secrets

Add your GitHub token to the deployed Worker:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Optional debug-route secret:

```bash
npx wrangler secret put DEBUG_SYNC_TOKEN
```

If you want deployed debug sync access, also set `ENABLE_DEBUG_ROUTES` in your Wrangler config or environment-specific config.

### 4. Apply remote migrations

```bash
npx wrangler d1 migrations apply DB --remote --config wrangler.jsonc
```

### 5. Deploy your fork

```bash
npm run deploy
```

### 6. Populate the feed

The scheduled sync will populate the feed automatically at `12:00 UTC`.

If you want to trigger an immediate sync after deploy, temporarily enable the debug route, call `/debug/sync` with the correct `x-debug-sync-token`, then disable it again.

## Operations

### Durable run history

Scheduled runs are recorded in D1 with:

- status
- duration
- planned vs processed owner/repo counts
- last checkpoint
- rate-limit snapshot

Protected debug endpoints expose the latest operator views:

- `/debug/sync-runs/latest`
- `/debug/sync-runs/latest-failed`
- `/debug/sync-runs/latest-rate-limited`

Manual owner-scoped syncs use the existing protected route:

- `/debug/sync?member=<login>`

### Cloudflare-native inspection

Use Cloudflare's built-in tools first when you need to inspect cron behavior:

1. Cron Events in the Workers dashboard for recent scheduled invocations.
2. Workers Logs in the dashboard for structured `sync.summary` and `sync.error` events.
3. `npm run ops:tail` for live log streaming with Wrangler.

### Rate-limit posture

The scheduler now reduces GitHub API cost and improves fairness by:

- rotating the starting owner for each full run
- resuming deferred repositories before fresh discovery work
- interleaving repository processing across owners instead of walking one owner at a time
- sending conditional GitHub REST requests when cached validators are available

## Scale-Up Path

If the repo set grows enough that sequential cron runs regularly defer work, the next architecture step is to fan out with Cloudflare Queues or Workflows:

- Queues are a good fit for per-repository fan-out and retry isolation.
- Workflows are a good fit for long-running, resumable orchestration with explicit checkpoints.

The current scheduler keeps a single-run design for simplicity, but the run history, checkpoints, and fairness logic are intended to make that transition straightforward if sustained GitHub rate limiting becomes normal.

## Deploy Button

Cloudflare deploy buttons only work for public GitHub or GitLab repositories.

Once your fork is public, add this to your fork README with your actual repository URL:

```markdown
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=<REPO_URL>)
```

## How It Works

1. The app reads a source-controlled list of GitHub accounts.
2. It calls `GET /users/:login/repos?sort=created&direction=desc&per_page=100&page=:n` until GitHub stops returning `rel="next"`.
3. For each repo, it fetches metadata from `GET /repos/:owner/:repo`.
4. It fetches the top-level Wrangler config and `package.json` from the repo's default branch, then falls back to `main` and `master`.
5. If the repo is a Cloudflare project, it stores the repo record, inferred Cloudflare products, and a normalized README preview in D1.
6. The homepage, JSON feed, and RSS feed all render from the stored project data.

README preview normalization removes decorative noise before cards are derived. That includes Markdown headings, common badge blocks, deploy buttons, and HTML image-link icon strips like browser-store buttons, so card copy starts with meaningful text instead of repo chrome.

## Routes

- `/`
- `/?page=:n`
- `/feed.json`
- `/rss.xml`
- `/projects/:owner/:repo.json`
- `/debug/sync`
- `/robots.txt`
- `/sitemap.xml`

## Testing

- `npm run test:fast` runs format, lint, typecheck, unit tests, and worker tests
- `npm run test:full` runs the full verification suite, including E2E, coverage, dependency audit, dead-code detection, duplicate-code detection, and secrets scanning

## Corpus Cache

- `npm run corpus:refresh` refreshes the committed offline corpus cache in `corpus-cache/`
- the cache stores each tracked project's current Wrangler config, `package.json`, and a small metadata manifest for future heuristic analysis

## Product Detection

| Product               | Detection heuristic                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers               | Any supported top-level Wrangler config file exists                                                                                               |
| Pages                 | `pages_build_output_dir` in Wrangler, `wrangler pages ...` scripts, or `@cloudflare/next-on-pages` / `@cloudflare/pages-plugin-cloudflare-access` |
| D1                    | `d1_databases` in Wrangler                                                                                                                        |
| KV                    | `kv_namespaces` in Wrangler                                                                                                                       |
| R2                    | `r2_buckets` in Wrangler                                                                                                                          |
| Durable Objects       | `durable_objects.bindings` in Wrangler                                                                                                            |
| Queues                | `queues.producers` or `queues.consumers` in Wrangler                                                                                              |
| Workflows             | `workflows` in Wrangler                                                                                                                           |
| Vectorize             | `vectorize` in Wrangler                                                                                                                           |
| AI                    | `ai` in Wrangler or packages such as `@cloudflare/ai`, `@cloudflare/ai-chat`, `@cloudflare/ai-utils`, or `workers-ai-provider`                    |
| AI Gateway            | `@cloudflare/ai-gateway` in `package.json`                                                                                                        |
| Browser Run           | `browser` in Wrangler or packages such as `@cloudflare/puppeteer`, `@cloudflare/playwright`, or `@cloudflare/playwright-mcp`                      |
| Containers            | `containers` in Wrangler or `@cloudflare/containers` in `package.json`                                                                            |
| Hyperdrive            | `hyperdrive` in Wrangler                                                                                                                          |
| Images                | `images` in Wrangler                                                                                                                              |
| Email                 | `send_email` in Wrangler                                                                                                                          |
| Analytics Engine      | `analytics_engine_datasets` in Wrangler                                                                                                           |
| Workers for Platforms | `dispatch_namespaces` in Wrangler                                                                                                                 |
| Secret Store          | `secrets_store_secrets` in Wrangler                                                                                                               |
| Realtime              | `@cloudflare/realtimekit*` packages in `package.json`                                                                                             |
| Stream                | `@cloudflare/stream-react` in `package.json`                                                                                                      |
| Voice                 | `@cloudflare/voice` in `package.json`                                                                                                             |
| Sandboxes             | `@cloudflare/sandbox` or the `@cloudflare/shell` + `@cloudflare/think` package combination                                                        |
| Agents                | `agents`, `hono-agents`, or `@cloudflare/agents` in `package.json`                                                                                |

These heuristics are best-effort. They indicate what the repo configuration or dependency graph strongly suggests, not a guarantee of every product actively used at runtime.

## Notes

- README previews are normalized during ingestion so heading-heavy, badge-heavy, and HTML-heavy READMEs read like feed copy instead of raw markup.
- Product detection is driven by committed heuristics over cached Wrangler configs and `package.json` files, including package-signaled products such as Agents, Sandboxes, Browser Run, Realtime, Stream, Voice, and AI Gateway.
- The homepage is the product. Project titles link directly to GitHub.
- Cards do not show supplementary action pills; the card links primarily to GitHub and keeps the rest of the UI focused on the preview.

## Docs

- spec: `specs/demoscene_spec.md`
- architecture: `specs/architecture.md`
- roadmap: `specs/roadmap.md`
- stack: `specs/stack.md`

## License

MIT
