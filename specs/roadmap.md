# Roadmap

Ordered feature roadmap extracted from the spec, with dependencies and guardrails-based completion criteria.

## Status

- `planned`
- `in_progress`
- `done`

## Global Definition Of Done

No feature is `done` until all apply:

- code is implemented and wired into the app
- required routes, scheduler hooks, and D1 migrations are reachable
- tests were added or updated for changed production code
- React UI states have component-level coverage where applicable
- fast check passes: format, lint, type check, unit tests
- full suite passes: fast check plus integration tests, contract checks for JSON routes, accessibility checks for UI, screenshot or E2E coverage for public pages, SAST, dependency audit, secrets scan, dead-code detection, duplicate-code detection, unit/component coverage floor, and reported worker integration coverage
- docs stay aligned with the shipped behavior

## Order

| ID  | Feature                                  | Depends on | Status |
| --- | ---------------------------------------- | ---------- | ------ |
| F0  | Delivery baseline and guardrails         | -          | done   |
| F1  | Source repo registry and fetch client    | F0         | done   |
| F2  | Wrangler detection and product inference | F1         | done   |
| F3  | Persistence and sync pipeline            | F1, F2     | done   |
| F4  | Read APIs                                | F3         | done   |
| F5  | Public feed page                         | F4         | done   |
| F6  | Support routes and indexing              | F4         | done   |

## Features

### F0. Delivery baseline and guardrails

Status: `done`

Scope:

- Cloudflare Worker project scaffold
- Hono app scaffold
- React SSR scaffold
- D1 setup and migration flow
- Drizzle ORM setup
- fast check command
- full suite command
- baseline test setup for unit, component, and integration tests
- baseline static analysis and security checks

Done when:

- project has a runnable Worker entrypoint
- Hono can serve a React SSR route
- D1 is configured and migrations can be applied
- fast and full verification commands exist and fail correctly on errors
- at least one smoke test covers a read route and one scheduled path

Quality gates:

- format, lint, type check, unit tests
- component tests run with React Testing Library
- integration test for Worker + D1 wiring
- SAST, dependency audit, secrets scan, dead-code detection, duplicate-code detection, and coverage floor are part of the full suite

### F1. Source repo registry and fetch client

Status: `done`

Depends on: `F0`

Scope:

- source-controlled list of GitHub team accounts
- repo discovery from the GitHub REST API
- parser and validator for repo URLs
- fetch helpers for GitHub repo metadata, repo HTML, raw README, and raw Wrangler files
- repo default branch, then `main`, then `master` fallback

Done when:

- invalid repo URLs are rejected
- team account discovery yields repo URLs from the GitHub API
- fetch logic tries the documented URLs in the documented order
- repo-not-found is detected cleanly
- homepage extraction from repo HTML is implemented

Quality gates:

- unit tests for URL parsing and branch fallback
- integration tests using fixed public fixtures or mocked HTTP responses with realistic payloads

### F2. Wrangler detection and product inference

Status: `done`

Depends on: `F1`

Scope:

- top-level-only Wrangler detection
- support `wrangler.toml`, `wrangler.json`, `wrangler.jsonc`
- parse config and infer Cloudflare products for icon display

Done when:

- repos without a top-level Wrangler config are excluded
- nested configs are ignored
- supported Wrangler formats parse correctly
- inferred product metadata is normalized for UI use

Quality gates:

- fixture-driven unit tests for TOML, JSON, and JSONC inputs
- negative tests for missing config, malformed config, and nested-only config

### F3. Persistence and sync pipeline

Status: `done`

Depends on: `F1`, `F2`

Scope:

- D1 tables for projects and inferred products
- scheduled sync at `12:00 UTC`
- new-project discovery
- per-repo error isolation
- initial README fetch and storage
- bounded README preview derivation and storage
- repository creation date and creation-order persistence for feed chronology
- homepage and preview media storage
- periodic stale-entry cleanup for older tracked repos
- repo removal when it can no longer be found
- ignore later README changes

Done when:

- first discovery creates one persistent project record
- repeated syncs are idempotent
- one bad repo or account does not abort the rest of the sync
- missing repos are removed from the site data
- transient upstream failures do not remove existing projects
- older repos are periodically revisited so stale entries do not persist forever
- later README changes do not overwrite stored README content
- feed preview Markdown is derived once and stays stable with the stored README
- feed ordering uses repository creation chronology with stable fallbacks
- homepage and preview media can refresh independently of README

Quality gates:

- integration tests for first sync, repeat sync, repo removal, and README immutability
- migration test or schema verification for D1 tables

### F4. Read APIs

Status: `done`

Depends on: `F3`

Scope:

- `/feed.json`
- `/rss.xml`
- `/projects/:owner/:repo.json`

Done when:

- feed payload returns all public projects in stable order
- feed payload returns card-ready data including preview Markdown and product metadata
- RSS uses the same stable chronology and remains valid for external consumers
- project payload returns one project with full README markdown, preview Markdown, homepage, preview media, and product metadata
- missing projects return the intended not-found response

Quality gates:

- integration tests for both JSON routes
- contract tests for stable JSON payload shape
- response shape assertions for product icons, links, and stored README markdown

### F5. Public feed page

Status: `done`

Depends on: `F4`

Scope:

- `/` page
- React SSR card list for all discovered projects
- product icons derived from Wrangler inference
- Markdown preview rendering for stored README previews
- GitHub-first card links, video presence links, and preview media
- visual cues from the spec

Done when:

- feed cards clearly show Cloudflare product icons
- bounded Markdown previews render safely and legibly
- latest day renders at the top of the feed and cards stay newest-first within each day
- GitHub-first card links are visible and usable
- layout works on desktop and mobile

Quality gates:

- React Testing Library coverage for card states and icon strip rendering
- integration test for server-rendered feed output
- accessibility checks for links, headings, and color contrast
- E2E coverage for loading the public feed and following a project link
- screenshot or visual regression coverage for the feed

### F6. Support routes and indexing

Status: `done`

Depends on: `F4`

Scope:

- `/robots.txt`
- `/sitemap.xml`

Done when:

- sitemap includes the feed and RSS surface
- robots output is valid for a public site

Quality gates:

- unit or integration tests for both support routes

## Out Of Scope For This Roadmap

- auth
- nested Wrangler config support
- README refresh after first discovery
