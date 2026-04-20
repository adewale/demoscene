# demoscene

`demoscene` is a Cloudflare Worker that scans a curated set of GitHub accounts and publishes a reverse-chronological feed of public Cloudflare projects.

It discovers repositories with the GitHub API, detects top-level Wrangler configs, stores the first README it sees, derives a cleaned preview for cards, and renders the result as HTML, JSON, and RSS.

## Live Surfaces

- Site: `https://demoscene.adewale-883.workers.dev/`
- JSON feed: `https://demoscene.adewale-883.workers.dev/feed.json`
- RSS feed: `https://demoscene.adewale-883.workers.dev/rss.xml`

## Features

- daily scheduled sync at `12:00 UTC`
- London schedule: `13:00` during BST and `12:00` during GMT
- GitHub API discovery with stable pagination handling
- GitHub-first feed cards ordered by real repository creation time
- top-level Wrangler detection for `wrangler.toml`, `wrangler.json`, and `wrangler.jsonc`
- inferred Cloudflare product metadata on each card
- cleaned README preview generation for feed cards, including heading, badge, and icon-strip cleanup
- machine-readable project JSON and RSS output

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
npx wrangler deploy
```

### 6. Populate the feed

The scheduled sync will populate the feed automatically at `12:00 UTC`.

If you want to trigger an immediate sync after deploy, temporarily enable the debug route, call `/debug/sync` with the correct `x-debug-sync-token`, then disable it again.

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
4. It fetches the top-level Wrangler config from the repo's default branch, then falls back to `main` and `master`.
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

## Notes

- README previews are normalized during ingestion so heading-heavy, badge-heavy, and HTML-heavy READMEs read like feed copy instead of raw markup.
- The homepage is the product. Project titles link directly to GitHub.
- Cards do not show a `Live` pill; only non-GitHub supplementary actions such as `Video` remain.

## Docs

- spec: `specs/demoscene_spec.md`
- architecture: `specs/architecture.md`
- roadmap: `specs/roadmap.md`
- stack: `specs/stack.md`

## License

MIT
