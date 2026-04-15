Simple public Cloudflare web app built with Hono and React SSR.

Purpose:

- show a newsfeed of team projects that are public GitHub repos using Cloudflare

Input:

- a source-controlled list of public GitHub repository URLs
- no auth
- no GitHub API

Fetch rules:

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
- for each repo, check only the top-level Wrangler config; supported filenames are `wrangler.toml`, `wrangler.json`, and `wrangler.jsonc`
- treat a repo as a Cloudflare project if one of those top-level Wrangler config files exists
- if a Cloudflare repo is discovered for the first time, create a new feed entry
- fetch and store the repo README using the branch fallback rules above
- infer which Cloudflare primitives and products the repo uses from that top-level Wrangler config, for example Workers, Pages, D1, KV, R2, Durable Objects, Queues, Workflows, Vectorize, or AI
- fetch and store the repo homepage and lightweight preview media when available
- ignore later README changes
- if a repo cannot be found, remove it from the site

Output:

- a public card-oriented web feed
- each feed card represents one repo
- each feed card shows icons that clearly signal which Cloudflare primitives and products are used
- each feed card renders a bounded preview of the stored README as Markdown
- each project detail page renders the full stored README as Markdown
- each card and detail page links to the repo homepage
- each card and detail page can also show lightweight preview media when available
- provide `/` for the feed and `/projects/:owner/:repo` for a persistent project detail page

Visual cues:

- use a warm off-white background, dark warm text, and Cloudflare orange as the primary accent
- use simple rounded cards or pills with light borders
- use restrained Cloudflare-style decoration: dashed dividers and, if needed, a very subtle dot-grid texture
- make the feed highly scannable: strong card hierarchy, clear icon strip, and concise metadata above the Markdown preview
