# Stack

## Decision

Use a server-first React stack on Cloudflare:

- TypeScript
- Cloudflare Workers
- Hono
- React SSR
- D1
- Drizzle ORM

This keeps the app simple at runtime while giving the feed and project pages a strong card-oriented component model.

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
- server-render React for `/` and `/projects/:owner/:repo`
- keep data loading on the server
- avoid SPA-style client-side routing
- hydrate only small UI affordances if they prove necessary later

## Component Architecture

Core page components:

- `AppShell`
- `FeedPage`
- `ProjectDetailPage`

Feed components:

- `FeedGrid`
- `ProjectCard`
- `ProductIconStrip`
- `ProjectMetaRow`
- `MarkdownPreview`
- `PreviewMedia`

Detail components:

- `ProjectHeader`
- `MarkdownDocument`
- `ProjectSidebar`

The feed should optimize for scanning. The detail page should optimize for reading.

## Data Shape Expectations

Feed card data should include:

- repo identity
- homepage URL
- preview media URL when available
- inferred Cloudflare product list
- bounded README preview Markdown

Project detail data should include:

- repo identity
- homepage URL
- preview media URL when available
- inferred Cloudflare product list
- full stored README Markdown

## Testing Strategy

Unit tests:

- repo URL parsing
- branch fallback logic
- Wrangler parsing
- Cloudflare product inference
- preview derivation

Property tests:

- parser and normalizer behavior using `fast-check`

Component tests:

- `ProjectCard`
- `ProductIconStrip`
- `MarkdownPreview`
- `MarkdownDocument`

Integration tests:

- scheduled sync with D1
- JSON routes
- SSR route wiring

E2E tests:

- `/` renders feed cards correctly
- `/projects/:owner/:repo` renders the full page correctly
- mobile layout remains usable
- homepage links and icon strips are visible and correct

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
