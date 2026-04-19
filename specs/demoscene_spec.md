Simple public Cloudflare web app built with Hono and React SSR.

Purpose:

- show a newsfeed of team projects that are public GitHub repos using Cloudflare

Input:

- a source-controlled list of public GitHub team accounts
- no auth
- no GitHub API

Fetch rules:

- for each team account `https://github.com/:owner?tab=repositories`, fetch public repository listing pages directly from GitHub HTML and discover repository URLs from those pages
- for each repo URL `https://github.com/:owner/:repo`, try branch `main` first, then `master`
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
- repo homepage is extracted from the public repo page HTML at `https://github.com/:owner/:repo`

Sync:

- run every day at 12:00 UTC
- discover public repos for each configured team account before checking individual repos
- for each repo, check only the top-level Wrangler config; supported filenames are `wrangler.toml`, `wrangler.json`, and `wrangler.jsonc`
- treat a repo as a Cloudflare project if one of those top-level Wrangler config files exists
- if a Cloudflare repo is discovered for the first time, create a new feed entry
- fetch and store the repo README using the branch fallback rules above
- infer which Cloudflare primitives and products the repo uses from that top-level Wrangler config, for example Workers, Pages, D1, KV, R2, Durable Objects, Queues, Workflows, Vectorize, or AI
- fetch and store the repo homepage and lightweight preview media when available
- ignore later README changes
- transient upstream failures must not remove existing projects or abort the full sync
- each sync produces summary counts for accounts scanned and repos discovered, added, updated, removed, and skipped transiently
- if a repo cannot be found, remove it from the site

Output:

- a public card-oriented web feed
- each feed card represents one repo
- the feed is reverse-chronological by repo creation-order proxy, not by ingestion time
- the feed should insert a clear day marker whenever a new day starts in the stream, instead of showing a date on every card
- each feed card shows recognizable icons that clearly signal which Cloudflare primitives and products are used
- those product indicators should link to the relevant Cloudflare product landing pages and explain the feature with hover/focus tooltips
- each feed card renders the first 2 README paragraphs as the preview content
- each feed card should prioritize compact, scan-first information: owner identity, project name, Cloudflare product signals, the first 2 README paragraphs, and a GitHub link
- each feed card may show a `Live` link only when there is a strong explicit signal that the target is a real live site for the project; weak or generic reference links should not be shown as `Live`
- each card's main link should go to the GitHub repo
- there should be no first-party project detail pages; this app is a feed, not a replacement for GitHub
- each card can also show lightweight preview media when available, with a stable fallback state when no preview image exists
- the homepage should not include an extra summary panel above the feed cards
- provide `/` for the feed
- provide `/feed.json` for machine consumers
- provide `/projects/:owner/:repo.json` for machine consumers of individual project records
- provide `/rss.xml` for feed readers; it should be valid RSS, rich enough to be worth subscribing to, and include useful excerpts plus action links
- provide `/debug/sync` for local or explicitly enabled manual sync verification

Visual cues:

- use a warm off-white background, dark warm text, and Cloudflare orange as the primary accent
- use simple rounded cards or pills with light borders
- use restrained Cloudflare-style decoration: dashed dividers and, if needed, a very subtle dot-grid texture
- make the feed highly scannable: strong card hierarchy, clear icon strip, and concise metadata above the Markdown preview
