Simple public Cloudflare web app built with Hono and React SSR showing a timeline of the public projects started by the Cloudflare DevRel team.

Purpose:

- show a newsfeed of team projects that are public GitHub repos using Cloudflare

Input:

- a source-controlled list of public GitHub team accounts
- a `GITHUB_TOKEN` secret for higher GitHub API limits in deployed environments

Fetch rules:

- for each team account, discover repositories through the GitHub REST API using `GET /users/:login/repos?sort=created&direction=desc&per_page=100&page=:n`
- continue paging while GitHub returns a `Link` header with `rel="next"`
- for each repo URL `https://github.com/:owner/:repo`, fetch repository metadata from `GET /repos/:owner/:repo`
- for raw README and Wrangler files, prefer the repo's actual default branch first, then fall back to `main` and `master`
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
- repo homepage is extracted from the public repo page HTML at `https://github.com/:owner/:repo`

Sync:

- run every day at 12:00 UTC
- discover public repos for each configured team account before checking individual repos
- for each repo, check only the top-level Wrangler config; supported filenames are `wrangler.toml`, `wrangler.json`, and `wrangler.jsonc`
- treat a repo as a Cloudflare project if one of those top-level Wrangler config files exists
- if a Cloudflare repo is discovered for the first time, create a new feed entry
- fetch and store the repo README using the branch fallback rules above
- fetch `package.json` best-effort for supplementary product heuristics such as Sandboxes and Agents
- persist the real repository creation time from GitHub as `repoCreatedAt` and use it for feed chronology when present
- infer which Cloudflare primitives and products the repo uses from the top-level Wrangler config plus package heuristics, for example Workers, Pages, D1, KV, R2, Durable Objects, Queues, Workflows, Vectorize, AI, Sandboxes, or Agents
- fetch and store the repo homepage and lightweight preview media when available
- preview image validation failures must not block the repo sync; keep the prior image when validation fails transiently
- ignore later README changes
- normalize README preview content into readable body text when deriving the stored feed preview, including Markdown headings, common badge blocks, deploy buttons, and decorative HTML image-link icon strips
- transient upstream failures must not remove existing projects or abort the full sync
- malformed Wrangler config should be counted explicitly in the sync summary
- if a repo cannot be found, remove it from the site

Output:

- a public card-oriented web feed
- each feed card represents one repo
- the feed is grouped by day with the latest day first
- cards within a day are ordered newest-first by repository creation time, using `repoCreatedAt` with stable fallbacks
- each feed card shows icons that clearly signal which Cloudflare primitives and products are used
- each feed card renders a bounded preview of the stored README as Markdown
- each card links primarily to the GitHub repo, with optional supplementary actions such as video links
- provide `/` for the feed and `/projects/:owner/:repo.json` for machine-readable project data

Visual cues:

- use a warm off-white background, dark warm text, and Cloudflare orange as the primary accent
- use simple rounded cards or pills with light borders
- use restrained Cloudflare-style decoration: dashed dividers and, if needed, a very subtle dot-grid texture
- make the feed highly scannable: strong card hierarchy, clear icon strip, and concise metadata above the Markdown preview
