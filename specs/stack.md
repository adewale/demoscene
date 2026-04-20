# Stack

## Decision

Use a server-first React stack on Cloudflare:

- TypeScript
- Cloudflare Workers
- Hono
- React SSR
- D1
- Drizzle ORM

This keeps the app simple at runtime while giving the feed a strong card-oriented component model.

## External Integrations

- GitHub REST API for repository discovery and repository metadata
- GitHub raw content endpoints for top-level `README.md` and Wrangler config fetches
- GitHub repo HTML for homepage and preview-image hints

## Packages

Application:

- `hono`
- `react`
- `react-dom`
- `drizzle-orm`
- `react-markdown`
- `rehype-sanitize`
- `remark-gfm`
- `smol-toml`
- `jsonc-parser`
- `zod`

Testing:

- `vitest`
- `@cloudflare/vitest-pool-workers`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `playwright`
- `fast-check`

## Why This Stack

- Hono matches the route shape cleanly
- React SSR gives the feed a reusable card system without turning the app into a client-heavy SPA
- D1 is enough for the project records and inferred products
- Drizzle ORM adds typed schema and query safety without changing the runtime model
- React Markdown plus sanitization fits the requirement to render stored README content safely
- the test stack supports unit, property, component, integration, contract, accessibility, visual, and E2E coverage

## Rendering Model

- use Hono for request handling
- server-render React for `/`
- keep data loading on the server
- avoid SPA-style client-side routing
- hydrate only small UI affordances if they prove necessary later

## Component Architecture

Core page components:

- `AppShell`
- `FeedPage`

Feed components:

- `ProjectCard`
- `ProductIconStrip`
- `ProjectMetaRow`
- `MarkdownPreview`

The feed should optimize for scanning and outbound click-through to GitHub.

## Data Shape Expectations

Feed card data should include:

- repo identity
- homepage URL
- preview media URL when available
- inferred Cloudflare product list
- bounded README preview Markdown

## Testing Strategy

Unit tests:

- repo URL parsing
- GitHub API paging and branch fallback logic
- Wrangler parsing
- Cloudflare product inference
- preview derivation

Property tests:

- parser and preview-normalizer behavior using `fast-check`

Component tests:

- `ProjectCard`
- `ProductIconStrip`
- `MarkdownPreview`

Integration tests:

- scheduled sync with D1
- JSON routes
- SSR route wiring

E2E tests:

- `/` renders feed cards correctly
- mobile layout remains usable
- GitHub-first links and icon strips are visible and correct

## Suggested Project Structure

- `src/index.tsx` for the Worker entrypoint
- `src/app.tsx` for Hono app construction
- `src/routes/` for route handlers
- `src/components/` for React UI
- `src/lib/github/` for fetch and parsing helpers
- `src/lib/wrangler/` for config parsing and inference
- `src/lib/markdown/` for preview derivation and rendering helpers
- `src/db/` for schema and queries
- `migrations/` for D1 migrations
- `tests/unit/`
- `tests/component/`
- `tests/integration/`
- `tests/e2e/`
