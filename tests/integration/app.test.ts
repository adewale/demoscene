import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../src/domain";
import { app } from "../../src/index";
import worker, { syncRepositories } from "../../src/index";
import MIGRATION_SQL from "../../migrations/0001_initial.sql?raw";
import MIGRATION_REPO_CREATION_ORDER_SQL from "../../migrations/0002_repo_creation_order.sql?raw";
import MIGRATION_REPO_CREATED_AT_SQL from "../../migrations/0003_repo_created_at.sql?raw";
import MIGRATION_REPOSITORY_SCAN_STATE_SQL from "../../migrations/0004_repository_scan_state.sql?raw";
import MIGRATION_SYNC_RUNS_SQL from "../../migrations/0005_sync_runs.sql?raw";
import MIGRATION_SYNC_OPERATIONS_SQL from "../../migrations/0006_sync_operations.sql?raw";
import MIGRATION_QUEUE_COORDINATION_SQL from "../../migrations/0007_queue_coordination.sql?raw";
import { TEAM_MEMBERS } from "../../src/config/repositories";

type MockResponse = {
  body: string;
  headers?: Record<string, string>;
  status?: number;
};

const testEnv = {
  ...(env as unknown as AppEnv),
  QUEUE_SYNC_ENABLED: "false",
} satisfies AppEnv;
const DEMO_REPOSITORY_URL = "https://github.com/acme/demo";

function buildRepositoryApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}`;
}

function buildUserRepositoriesApiUrl(login: string, page: number): string {
  return `https://api.github.com/users/${login}/repos?sort=created&direction=desc&per_page=100&page=${page}`;
}

function buildRepositoryApiResponse(values: {
  createdAt?: string;
  defaultBranch?: string;
  homepageUrl?: string | null;
  owner: string;
  repo: string;
  repoId?: number;
}): MockResponse {
  return {
    body: JSON.stringify({
      created_at: values.createdAt ?? "2026-04-14T12:00:00.000Z",
      default_branch: values.defaultBranch ?? "main",
      homepage: values.homepageUrl ?? "https://demo.example.com",
      html_url: `https://github.com/${values.owner}/${values.repo}`,
      id: values.repoId ?? 12345,
      name: values.repo,
      owner: { login: values.owner },
    }),
    headers: { "content-type": "application/json" },
  };
}

function buildUserRepositoriesApiResponse(values: {
  hasNextPage?: boolean;
  login: string;
  nextPage?: number;
  repositories: Array<{
    createdAt?: string;
    defaultBranch?: string;
    homepageUrl?: string | null;
    repo: string;
    repoId?: number;
  }>;
}): MockResponse {
  return {
    body: JSON.stringify(
      values.repositories.map((repository) => ({
        created_at: repository.createdAt ?? "2026-04-14T12:00:00.000Z",
        default_branch: repository.defaultBranch ?? "main",
        homepage: repository.homepageUrl ?? "https://demo.example.com",
        html_url: `https://github.com/${values.login}/${repository.repo}`,
        id: repository.repoId ?? 12345,
        name: repository.repo,
        owner: { login: values.login },
      })),
    ),
    headers: {
      "content-type": "application/json",
      ...((values.nextPage ?? (values.hasNextPage ? 2 : undefined))
        ? {
            link: `<${buildUserRepositoriesApiUrl(values.login, values.nextPage ?? 2)}>; rel="next"`,
          }
        : {}),
    },
  };
}

function buildRepositoryHomepageHtml(homepageUrl: string): string {
  return `<a data-testid="repository-homepage-url" href="${homepageUrl}">demo</a>`;
}

function buildDemoRepositoryResponses(options?: {
  homepageUrl?: string;
  readme?: string;
  repoPageBody?: string;
  wrangler?: string;
}): Record<string, MockResponse> {
  return {
    [buildRepositoryApiUrl("acme", "demo")]: buildRepositoryApiResponse({
      createdAt: "2026-04-14T12:00:00.000Z",
      homepageUrl: options?.homepageUrl ?? "https://demo.example.com",
      owner: "acme",
      repo: "demo",
      repoId: 12345,
    }),
    [DEMO_REPOSITORY_URL]: {
      body:
        options?.repoPageBody ??
        buildRepositoryHomepageHtml(
          options?.homepageUrl ?? "https://demo.example.com",
        ),
    },
    "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
      body: options?.wrangler ?? `name = "demo"`,
    },
    "https://raw.githubusercontent.com/acme/demo/main/README.md": {
      body: options?.readme ?? "# Demo",
    },
  };
}

function buildRateLimitedWranglerResponses(): Record<string, MockResponse> {
  const responses: Record<string, MockResponse> = {};

  for (const fileName of ["wrangler.toml", "wrangler.json", "wrangler.jsonc"]) {
    for (const branch of ["main", "master"]) {
      responses[
        `https://raw.githubusercontent.com/acme/demo/${branch}/${fileName}`
      ] = {
        body: "rate limited",
        status: 403,
      };
    }
  }

  return responses;
}

function buildRateLimitedResponse(retryAfterSeconds = 120): MockResponse {
  return {
    body: "rate limited",
    headers: {
      "retry-after": String(retryAfterSeconds),
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(
        Math.floor(Date.now() / 1000) + retryAfterSeconds,
      ),
    },
    status: 429,
  };
}

async function seedProjectRecord(values: {
  owner: string;
  repo: string;
  repoUrl: string;
  firstSeenAt?: string;
  repoCreatedAt?: string;
  repoCreationOrder?: number;
}) {
  await testEnv.DB.prepare(
    `INSERT INTO projects (
      slug, owner, repo, repo_url, repo_creation_order, repo_created_at, homepage_url, branch, wrangler_path, wrangler_format,
      readme_markdown, readme_preview_markdown, preview_image_url, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `${values.owner}/${values.repo}`,
      values.owner,
      values.repo,
      values.repoUrl,
      values.repoCreationOrder ?? 0,
      values.repoCreatedAt ?? values.firstSeenAt ?? "2026-04-14T12:00:00.000Z",
      "https://demo.example.com",
      "main",
      "wrangler.toml",
      "toml",
      "# Demo Json",
      "# Demo Json",
      null,
      values.firstSeenAt ?? "2026-04-14T12:00:00.000Z",
      values.firstSeenAt ?? "2026-04-14T12:00:00.000Z",
    )
    .run();
}

async function seedProjectRange(count: number) {
  for (let index = 0; index < count; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    await seedProjectRecord({
      owner: "acme",
      repo: `demo-${index + 1}`,
      repoUrl: `https://github.com/acme/demo-${index + 1}`,
      firstSeenAt: `2026-04-${day}T12:00:00.000Z`,
      repoCreatedAt: `2026-04-${day}T12:00:00.000Z`,
      repoCreationOrder: index + 1,
    });
  }
}

async function syncDemoRepository(
  responses: Record<string, MockResponse>,
  now?: Date,
) {
  await syncRepositories(testEnv, {
    fetch: createMockFetch(responses) as typeof fetch,
    now,
    repositories: [DEMO_REPOSITORY_URL],
  });
}

async function fetchFeedItems(): Promise<unknown[]> {
  const response = await SELF.fetch("https://example.com/feed.json");
  const payload = (await response.json()) as { items: unknown[] };
  return payload.items;
}

function expectFeedToContainRepos(
  payload: { items: Array<Record<string, unknown>> },
  repos: string[],
) {
  for (const repo of repos) {
    expect(payload.items.some((item) => item.repo === repo)).toBe(true);
  }
}

function expectSummaryToInclude(
  summary: Awaited<ReturnType<typeof syncRepositories>>,
  values: Record<string, number>,
) {
  expect(summary).toEqual(expect.objectContaining(values));
}

async function fetchFeedPayload(): Promise<{
  items: Array<Record<string, unknown>>;
}> {
  return (await (await SELF.fetch("https://example.com/feed.json")).json()) as {
    items: Array<Record<string, unknown>>;
  };
}

function createMockFetch(responses: Record<string, MockResponse>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const response = responses[url];

    if (!response) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(response.body, {
      headers: response.headers,
      status: response.status ?? 200,
    });
  });
}

async function resetDatabase() {
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_planner_locks").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_run_phases").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_run_jobs").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_runs").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS sync_state").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS github_response_cache").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS repository_scan_state").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS project_products").run();
  await testEnv.DB.prepare("DROP TABLE IF EXISTS projects").run();

  for (const migrationSql of [
    MIGRATION_SQL,
    MIGRATION_REPO_CREATION_ORDER_SQL,
    MIGRATION_REPO_CREATED_AT_SQL,
    MIGRATION_REPOSITORY_SCAN_STATE_SQL,
    MIGRATION_SYNC_RUNS_SQL,
    MIGRATION_SYNC_OPERATIONS_SQL,
    MIGRATION_QUEUE_COORDINATION_SQL,
  ]) {
    for (const statement of migrationSql
      .split(";")
      .map((value: string) => value.trim())
      .filter(Boolean)) {
      await testEnv.DB.prepare(statement).run();
    }
  }
}

async function fetchLatestSyncRun() {
  return (await testEnv.DB.prepare(
    `SELECT cron, duration_ms, error_message, finished_at, last_checkpoint_json,
            mode, planned_owner_count, planned_repo_count, processed_owner_count,
            processed_repo_count, rate_limit_snapshot_json, rate_limited_until,
            repos_deferred_by_rate_limit, started_at, status, summary_json
     FROM sync_runs
     ORDER BY id DESC
     LIMIT 1`,
  ).first()) as {
    cron: string;
    duration_ms: number;
    error_message: string | null;
    finished_at: string;
    last_checkpoint_json: string | null;
    mode: string;
    planned_owner_count: number;
    planned_repo_count: number;
    processed_owner_count: number;
    processed_repo_count: number;
    rate_limit_snapshot_json: string | null;
    rate_limited_until: string | null;
    repos_deferred_by_rate_limit: number;
    started_at: string;
    status: string;
    summary_json: string | null;
  } | null;
}

async function fetchSyncState(mode = "incremental") {
  return (await testEnv.DB.prepare(
    `SELECT checkpoint_json, next_owner_cursor, pending_repository_urls_json
     FROM sync_state
     WHERE mode = ?`,
  )
    .bind(mode)
    .first()) as {
    checkpoint_json: string | null;
    next_owner_cursor: number;
    pending_repository_urls_json: string;
  } | null;
}

describe("Worker app", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("syncs a new repository and exposes card-ready feed JSON", async () => {
    const mockFetch = createMockFetch({
      [buildRepositoryApiUrl("acme", "demo")]: buildRepositoryApiResponse({
        owner: "acme",
        repo: "demo",
      }),
      "https://github.com/acme/demo": {
        body: `
          <html>
            <head>
              <meta property="og:image" content="https://images.example.com/demo.png" />
              <meta name="octolytics-dimension-repository_id" content="12345" />
            </head>
            <body>
              <a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>
            </body>
          </html>
        `,
      },
      "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
        body: `name = "demo"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
`,
      },
      "https://raw.githubusercontent.com/acme/demo/main/README.md": {
        body: "# Demo\n\nThe first project in the feed.",
      },
    });

    await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      now: new Date("2026-04-14T12:00:00.000Z"),
      repositories: ["https://github.com/acme/demo"],
    });

    const response = await SELF.fetch("https://example.com/feed.json");
    const payload = (await response.json()) as {
      items: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.homepageUrl).toBe("https://demo.example.com");
    expect(payload.items[0]?.repoCreatedAt).toBe("2026-04-14T12:00:00.000Z");
    expect(payload.items[0]?.repoCreationOrder).toBe(12345);
    expect(payload.items[0]?.readmePreviewMarkdown).toBe(
      "Demo\n\nThe first project in the feed.",
    );
    expect(payload.items[0]?.products).toEqual([
      { key: "workers", label: "Workers" },
      { key: "pages", label: "Pages" },
      { key: "d1", label: "D1" },
    ]);
  });

  it("normalizes HTML-heavy README hero content into readable preview markdown", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildRepositoryApiUrl("acme", "demo")]: buildRepositoryApiResponse({
          owner: "acme",
          repo: "demo",
        }),
        "https://github.com/acme/demo": {
          body: buildRepositoryHomepageHtml("https://demo.example.com"),
        },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: `<div align="center">
  <h1>Demo</h1>
  <p><em>Ship a clearer feed preview</em></p>
</div>

<p>Built on Cloudflare Workers.</p>`,
        },
      }) as typeof fetch,
      repositories: ["https://github.com/acme/demo"],
    });

    const payload = await fetchFeedPayload();

    expect(payload.items[0]?.readmePreviewMarkdown).toBe(
      "Demo\n\nShip a clearer feed preview\n\nBuilt on Cloudflare Workers.",
    );
  });

  it("infers Sandboxes and Agents from package.json heuristics during sync", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildRepositoryApiUrl("acme", "bookworm")]: buildRepositoryApiResponse(
          {
            owner: "acme",
            repo: "bookworm",
          },
        ),
        "https://github.com/acme/bookworm": {
          body: buildRepositoryHomepageHtml("https://demo.example.com"),
        },
        "https://raw.githubusercontent.com/acme/bookworm/main/wrangler.jsonc": {
          body: `{
            "ai": { "binding": "AI" },
            "r2_buckets": [{ "binding": "WORKSPACE_R2" }],
            "durable_objects": {
              "bindings": [{ "name": "BookWormAgent", "class_name": "BookWormAgent" }]
            }
          }`,
        },
        "https://raw.githubusercontent.com/acme/bookworm/main/package.json": {
          body: `{
            "dependencies": {
              "@cloudflare/shell": "^0.3.2",
              "@cloudflare/think": "^0.2.1",
              "agents": "^0.10.2"
            }
          }`,
        },
        "https://raw.githubusercontent.com/acme/bookworm/main/README.md": {
          body: "# Bookworm\n\nA reading agent.",
        },
      }) as typeof fetch,
      repositories: ["https://github.com/acme/bookworm"],
    });

    const payload = await fetchFeedPayload();

    expect(payload.items[0]?.products).toEqual([
      { key: "workers", label: "Workers" },
      { key: "r2", label: "R2" },
      { key: "durable-objects", label: "Durable Objects" },
      { key: "ai", label: "Workers AI" },
      { key: "sandboxes", label: "Sandboxes" },
      { key: "agents", label: "Agents" },
    ]);
  });

  it("keeps the meaningful web2kindle summary while dropping decorative badge and icon blocks", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildRepositoryApiUrl("acme", "web2kindle")]:
          buildRepositoryApiResponse({
            owner: "acme",
            repo: "web2kindle",
          }),
        "https://github.com/acme/web2kindle": {
          body: buildRepositoryHomepageHtml("https://demo.example.com"),
        },
        "https://raw.githubusercontent.com/acme/web2kindle/main/wrangler.toml":
          {
            body: `name = "web2kindle"`,
          },
        "https://raw.githubusercontent.com/acme/web2kindle/main/README.md": {
          body: `# Web2Kindle 📚

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/megaconfidence/web2kindle.svg)](https://github.com/megaconfidence/web2kindle/stargazers)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/megaconfidence/web2kindle)

Transform any web article into a beautifully formatted Kindle ebook with just one click. Web2Kindle is a free and open-source Chrome extension that sends web content directly to your Kindle device for distraction-free reading.

<a href="https://chromewebstore.google.com/detail/web2kindle/demo" target="_blank">
  <img src="/public/images/chrome.webp" style="height:50px;" />
</a>
<a href="https://addons.mozilla.org/en-US/firefox/addon/web2kindle/" target="_blank">
  <img src="/public/images/firefox.webp" style="height:50px;" />
</a>
</br>
</br>

## Features ✨

- Fast delivery to any Kindle device`,
        },
      }) as typeof fetch,
      repositories: ["https://github.com/acme/web2kindle"],
    });

    const payload = await fetchFeedPayload();
    const preview = payload.items[0]?.readmePreviewMarkdown;

    expect(preview).toContain(
      "Transform any web article into a beautifully formatted Kindle ebook with just one click. Web2Kindle is a free and open-source Chrome extension that sends web content directly to your Kindle device for distraction-free reading.",
    );
    expect(preview).toContain("Features ✨");
    expect(preview).not.toContain("img.shields.io");
    expect(preview).not.toContain("deploy.workers.cloudflare.com/button");
    expect(preview).not.toContain("chromewebstore.google.com");
    expect(preview).not.toContain("addons.mozilla.org");
  });

  it("drops extracted preview image URLs that would render as broken images", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildRepositoryApiUrl("acme", "demo")]: buildRepositoryApiResponse({
          owner: "acme",
          repo: "demo",
        }),
        [DEMO_REPOSITORY_URL]: {
          body: `
            <html>
              <head>
                <meta property="og:image" content="https://images.example.com/broken.png" />
              </head>
              <body>
                <a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>
              </body>
            </html>
          `,
        },
        "https://images.example.com/broken.png": {
          body: "not-an-image",
          headers: { "content-type": "text/html" },
          status: 200,
        },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: "# Demo",
        },
      }) as typeof fetch,
      repositories: [DEMO_REPOSITORY_URL],
    });

    const response = await SELF.fetch("https://example.com/feed.json");
    const payload = (await response.json()) as {
      items: Array<Record<string, unknown>>;
    };

    expect(payload.items[0]?.previewImageUrl).toBeNull();
  });

  it("discovers public repos from the configured team accounts", async () => {
    const summary = await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildUserRepositoriesApiUrl("adewale", 1)]:
          buildUserRepositoriesApiResponse({
            login: "adewale",
            repositories: [{ repo: "demo", repoId: 98765 }],
          }),
        "https://github.com/adewale/demo": {
          body: `<a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>`,
        },
        "https://raw.githubusercontent.com/adewale/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/adewale/demo/main/README.md": {
          body: "# Demo\n\nTracked from an account page.",
        },
      }) as typeof fetch,
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    const response = await SELF.fetch("https://example.com/feed.json");
    const payload = (await response.json()) as {
      items: Array<Record<string, unknown>>;
    };

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.repoUrl).toBe("https://github.com/adewale/demo");
    expect(payload.items[0]?.repoCreatedAt).toBe("2026-04-14T12:00:00.000Z");
    expect(summary).toEqual(
      expect.objectContaining({
        accountsScanned: 1,
        reposAdded: 1,
        reposDiscovered: 1,
      }),
    );
  });

  it("reports account discovery failures without pretending every account succeeded", async () => {
    const summary = await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildUserRepositoriesApiUrl("adewale", 1)]:
          buildUserRepositoriesApiResponse({
            login: "adewale",
            repositories: [{ repo: "demo", repoId: 98765 }],
          }),
        [buildUserRepositoriesApiUrl("zeke", 1)]: {
          body: "boom",
          status: 500,
        },
        "https://github.com/adewale/demo": {
          body: buildRepositoryHomepageHtml("https://demo.example.com"),
        },
        "https://raw.githubusercontent.com/adewale/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/adewale/demo/main/README.md": {
          body: "# Demo",
        },
      }) as typeof fetch,
      teamMembers: [
        { login: "adewale", name: "Ade" },
        { login: "zeke", name: "Zeke" },
      ],
    });

    expect(summary).toEqual(
      expect.objectContaining({
        accountsFailed: 1,
        accountsScanned: 2,
        accountsSucceeded: 1,
        reposAdded: 1,
      }),
    );
  });

  it("does not reprocess ignored repos until their negative-cache revisit window expires", async () => {
    const firstFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [{ repo: "plain-repo", repoId: 98765 }],
        }),
      [buildRepositoryApiUrl("adewale", "plain-repo")]:
        buildRepositoryApiResponse({
          owner: "adewale",
          repo: "plain-repo",
        }),
      "https://github.com/adewale/plain-repo": {
        body: buildRepositoryHomepageHtml("https://plain.example.com"),
      },
    });

    await syncRepositories(testEnv, {
      fetch: firstFetch as typeof fetch,
      now: new Date("2026-04-14T12:00:00.000Z"),
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    const secondFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [{ repo: "plain-repo", repoId: 98765 }],
        }),
      [buildRepositoryApiUrl("adewale", "plain-repo")]:
        buildRepositoryApiResponse({
          owner: "adewale",
          repo: "plain-repo",
        }),
      "https://github.com/adewale/plain-repo": {
        body: buildRepositoryHomepageHtml("https://plain.example.com"),
      },
    });

    await syncRepositories(testEnv, {
      fetch: secondFetch as typeof fetch,
      now: new Date("2026-04-15T12:00:00.000Z"),
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    const requestedUrls = secondFetch.mock.calls.map(([input]) =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );

    expect(requestedUrls).toContain(buildUserRepositoriesApiUrl("adewale", 1));
    expect(requestedUrls).not.toContain(
      buildRepositoryApiUrl("adewale", "plain-repo"),
    );
    expect(requestedUrls).not.toContain(
      "https://github.com/adewale/plain-repo",
    );
    expect(
      requestedUrls.some((url) =>
        url.startsWith("https://raw.githubusercontent.com/adewale/plain-repo/"),
      ),
    ).toBe(false);
  });

  it("automatically picks up a newly listed repo without disturbing known repos", async () => {
    await seedProjectRecord({
      firstSeenAt: "2026-04-19T12:00:00.000Z",
      owner: "adewale",
      repo: "known-repo",
      repoUrl: "https://github.com/adewale/known-repo",
      repoCreatedAt: "2026-04-10T12:00:00.000Z",
      repoCreationOrder: 100,
    });

    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [
            {
              createdAt: "2026-04-20T12:00:00.000Z",
              homepageUrl: "https://new.example.com",
              repo: "new-repo",
              repoId: 200,
            },
            {
              createdAt: "2026-04-10T12:00:00.000Z",
              homepageUrl: "https://known.example.com",
              repo: "known-repo",
              repoId: 100,
            },
          ],
        }),
      "https://github.com/adewale/new-repo": {
        body: buildRepositoryHomepageHtml("https://new.example.com"),
      },
      "https://raw.githubusercontent.com/adewale/new-repo/main/wrangler.toml": {
        body: `name = "new-repo"`,
      },
      "https://raw.githubusercontent.com/adewale/new-repo/main/README.md": {
        body: "# New Repo",
      },
    });

    const summary = await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      now: new Date("2026-04-20T12:00:00.000Z"),
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    const payload = await fetchFeedPayload();

    expectSummaryToInclude(summary, {
      reposAdded: 1,
    });
    expectFeedToContainRepos(payload, ["new-repo"]);
    expectFeedToContainRepos(payload, ["known-repo"]);
  });

  it("follows GitHub API pagination when discovering team repos", async () => {
    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          hasNextPage: true,
          login: "adewale",
          repositories: [
            { repo: "new-repo-a", repoId: 300 },
            { repo: "new-repo-b", repoId: 200 },
          ],
        }),
      [buildUserRepositoriesApiUrl("adewale", 2)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [{ repo: "new-repo-c", repoId: 100 }],
        }),
      "https://github.com/adewale/new-repo-a": {
        body: buildRepositoryHomepageHtml("https://a.example.com"),
      },
      "https://github.com/adewale/new-repo-b": {
        body: buildRepositoryHomepageHtml("https://b.example.com"),
      },
      "https://github.com/adewale/new-repo-c": {
        body: buildRepositoryHomepageHtml("https://c.example.com"),
      },
      "https://raw.githubusercontent.com/adewale/new-repo-a/main/wrangler.toml":
        {
          body: `name = "new-repo-a"`,
        },
      "https://raw.githubusercontent.com/adewale/new-repo-a/main/README.md": {
        body: "# Repo A",
      },
      "https://raw.githubusercontent.com/adewale/new-repo-b/main/wrangler.toml":
        {
          body: `name = "new-repo-b"`,
        },
      "https://raw.githubusercontent.com/adewale/new-repo-b/main/README.md": {
        body: "# Repo B",
      },
      "https://raw.githubusercontent.com/adewale/new-repo-c/main/wrangler.toml":
        {
          body: `name = "new-repo-c"`,
        },
      "https://raw.githubusercontent.com/adewale/new-repo-c/main/README.md": {
        body: "# Repo C",
      },
    });

    const summary = await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      now: new Date("2026-04-20T12:00:00.000Z"),
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });
    const payload = await fetchFeedPayload();

    expectSummaryToInclude(summary, {
      reposAdded: 3,
    });
    expectFeedToContainRepos(payload, [
      "new-repo-a",
      "new-repo-b",
      "new-repo-c",
    ]);
  });

  it("removes tracked repos missing from the GitHub API listing", async () => {
    await seedProjectRecord({
      firstSeenAt: "2026-04-19T12:00:00.000Z",
      owner: "adewale",
      repo: "known-repo",
      repoUrl: "https://github.com/adewale/known-repo",
    });
    await seedProjectRecord({
      owner: "adewale",
      repo: "missing-repo",
      repoUrl: "https://github.com/adewale/missing-repo",
    });

    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [{ repo: "known-repo", repoId: 100 }],
        }),
    });

    const summary = await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    expect(summary.reposRemoved).toBe(1);
    expect(await fetchFeedItems()).toHaveLength(1);
  });

  it("incremental sync removes tracked repos missing from the listing when the repo now 404s", async () => {
    await seedProjectRecord({
      owner: "adewale",
      repo: "missing-repo",
      repoUrl: "https://github.com/adewale/missing-repo",
    });

    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [],
        }),
      [buildRepositoryApiUrl("adewale", "missing-repo")]: {
        body: "missing",
        status: 404,
      },
    });

    const summary = await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      mode: "incremental",
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    expect(summary.reposRemoved).toBe(1);
    expect(await fetchFeedItems()).toHaveLength(0);
  });

  it("incremental sync keeps tracked repos that are missing from the listing but still resolve", async () => {
    await seedProjectRecord({
      owner: "adewale",
      repo: "known-repo",
      repoUrl: "https://github.com/adewale/known-repo",
    });

    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [],
        }),
      [buildRepositoryApiUrl("adewale", "known-repo")]:
        buildRepositoryApiResponse({
          owner: "adewale",
          repo: "known-repo",
        }),
      "https://github.com/adewale/known-repo": {
        body: buildRepositoryHomepageHtml("https://known.example.com"),
      },
      "https://raw.githubusercontent.com/adewale/known-repo/main/wrangler.toml":
        {
          body: 'name = "known-repo"',
        },
      "https://raw.githubusercontent.com/adewale/known-repo/main/README.md": {
        body: "# Known Repo",
      },
    });

    const summary = await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      mode: "incremental",
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    expect(summary.reposRemoved).toBe(0);
    expect(await fetchFeedItems()).toHaveLength(1);
  });

  it("continues syncing later repos when one configured repo is invalid", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch(buildDemoRepositoryResponses()) as typeof fetch,
      repositories: ["https://example.com/not-github", DEMO_REPOSITORY_URL],
    });

    const response = await SELF.fetch("https://example.com/feed.json");
    const payload = (await response.json()) as { items: unknown[] };

    expect(payload.items).toHaveLength(1);
  });

  it("keeps the original README while refreshing homepage metadata", async () => {
    await syncDemoRepository(
      buildDemoRepositoryResponses({
        homepageUrl: "https://v1.example.com",
        readme: "# Demo\n\nOriginal README.",
      }),
      new Date("2026-04-14T12:00:00.000Z"),
    );

    await syncDemoRepository(
      buildDemoRepositoryResponses({
        homepageUrl: "https://v2.example.com",
        readme: "# Demo\n\nChanged README.",
      }),
      new Date("2026-04-15T12:00:00.000Z"),
    );

    const response = await SELF.fetch(
      "https://example.com/projects/acme/demo.json",
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.homepageUrl).toBe("https://v2.example.com");
    expect(payload.readmeMarkdown).toBe("# Demo\n\nOriginal README.");
  });

  it("removes repos that can no longer be found", async () => {
    await syncDemoRepository(
      buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
    );
    await syncDemoRepository({
      [buildRepositoryApiUrl("acme", "demo")]: {
        body: "missing",
        status: 404,
      },
      [DEMO_REPOSITORY_URL]: { body: "missing", status: 404 },
    });

    expect(await fetchFeedItems()).toHaveLength(0);
  });

  it("keeps paging past ten GitHub API pages so older tracked repos are not pruned", async () => {
    await seedProjectRecord({
      owner: "adewale",
      repo: "known-repo",
      repoUrl: "https://github.com/adewale/known-repo",
    });

    const responses: Record<string, MockResponse> = {
      "https://github.com/adewale/known-repo": {
        body: buildRepositoryHomepageHtml("https://known.example.com"),
      },
      "https://raw.githubusercontent.com/adewale/known-repo/main/wrangler.toml":
        {
          body: 'name = "known-repo"',
        },
    };

    for (let page = 1; page <= 11; page += 1) {
      responses[buildUserRepositoriesApiUrl("adewale", page)] =
        buildUserRepositoriesApiResponse({
          login: "adewale",
          nextPage: page < 11 ? page + 1 : undefined,
          repositories: [
            {
              createdAt: `2026-04-${String(12 - page).padStart(2, "0")}T12:00:00.000Z`,
              repo: page === 11 ? "known-repo" : `repo-${page}`,
              repoId: 1000 - page,
            },
          ],
        });
    }

    const summary = await syncRepositories(testEnv, {
      fetch: createMockFetch(responses) as typeof fetch,
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    const payload = await fetchFeedPayload();

    expect(summary.reposRemoved).toBe(0);
    expect(payload.items.some((item) => item.repo === "known-repo")).toBe(true);
  });

  it("defers the remaining repository work once GitHub rate limits the run", async () => {
    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [
            { repo: "rate-limited", repoId: 300 },
            { repo: "never-reached", repoId: 200 },
          ],
        }),
      [buildRepositoryApiUrl("adewale", "rate-limited")]:
        buildRepositoryApiResponse({ owner: "adewale", repo: "rate-limited" }),
      [buildRepositoryApiUrl("adewale", "never-reached")]:
        buildRepositoryApiResponse({ owner: "adewale", repo: "never-reached" }),
      "https://raw.githubusercontent.com/adewale/rate-limited/main/wrangler.toml":
        buildRateLimitedResponse(),
      "https://raw.githubusercontent.com/adewale/rate-limited/master/wrangler.toml":
        buildRateLimitedResponse(),
      "https://raw.githubusercontent.com/adewale/rate-limited/main/wrangler.json":
        buildRateLimitedResponse(),
      "https://raw.githubusercontent.com/adewale/rate-limited/master/wrangler.json":
        buildRateLimitedResponse(),
      "https://raw.githubusercontent.com/adewale/rate-limited/main/wrangler.jsonc":
        buildRateLimitedResponse(),
      "https://raw.githubusercontent.com/adewale/rate-limited/master/wrangler.jsonc":
        buildRateLimitedResponse(),
    });

    const summary = await syncRepositories(testEnv, {
      fetch: mockFetch as typeof fetch,
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    expect(summary).toEqual(
      expect.objectContaining({
        rateLimitedUntil: expect.any(String),
        reposDeferredByRateLimit: 2,
      }),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        url: buildRepositoryApiUrl("adewale", "never-reached"),
      }),
    );
  });

  it("can prune repos for owners removed from the tracked team list", async () => {
    await seedProjectRecord({
      owner: "someoneelse",
      repo: "old-repo",
      repoUrl: "https://github.com/someoneelse/old-repo",
    });

    const summary = await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildUserRepositoriesApiUrl("adewale", 1)]:
          buildUserRepositoriesApiResponse({
            login: "adewale",
            repositories: [],
          }),
      }) as typeof fetch,
      now: new Date("2026-04-20T12:00:00.000Z"),
      pruneUntrackedOwners: true,
      teamMembers: [{ login: "adewale", name: "Ade" }],
    });

    expect(summary.reposRemoved).toBe(1);
    expect(await fetchFeedItems()).toHaveLength(0);
  });

  it("keeps existing projects when Wrangler fetches fail transiently", async () => {
    await syncDemoRepository(
      buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
    );
    await syncDemoRepository({
      [buildRepositoryApiUrl("acme", "demo")]: buildRepositoryApiResponse({
        owner: "acme",
        repo: "demo",
      }),
      [DEMO_REPOSITORY_URL]: { body: "<html></html>" },
      ...buildRateLimitedWranglerResponses(),
    });

    expect(await fetchFeedItems()).toHaveLength(1);
  });

  it("keeps syncing a project when preview image validation fails transiently", async () => {
    const summary = await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [buildRepositoryApiUrl("acme", "demo")]: buildRepositoryApiResponse({
          owner: "acme",
          repo: "demo",
        }),
        [DEMO_REPOSITORY_URL]: {
          body: `
            <html>
              <head>
                <meta property="og:image" content="https://images.example.com/transient.png" />
              </head>
              <body>
                <a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>
              </body>
            </html>
          `,
        },
        "https://images.example.com/transient.png": {
          body: "temporarily unavailable",
          status: 503,
        },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: 'name = "demo"',
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: "# Demo",
        },
      }) as typeof fetch,
      repositories: [DEMO_REPOSITORY_URL],
    });

    const payload = await fetchFeedPayload();

    expect(summary.reposAdded).toBe(1);
    expect(payload.items[0]?.previewImageUrl).toBeNull();
  });

  it("counts malformed Wrangler configs without silently dropping existing projects", async () => {
    await syncDemoRepository(buildDemoRepositoryResponses());

    const summary = await syncRepositories(testEnv, {
      fetch: createMockFetch(
        buildDemoRepositoryResponses({
          wrangler: "name =",
        }),
      ) as typeof fetch,
      repositories: [DEMO_REPOSITORY_URL],
    });

    expect(summary.reposInvalidConfig).toBe(1);
    expect(await fetchFeedItems()).toHaveLength(1);
  });

  it("renders HTML routes and support routes", async () => {
    await syncDemoRepository(
      buildDemoRepositoryResponses({
        readme:
          "# Demo\n\nWelcome to **demo**.\n\n[Live site](https://demo.example.com/live)\n\n[Watch demo](https://www.loom.com/share/demo)",
        wrangler: `pages_build_output_dir = "dist"`,
      }),
      new Date("2026-04-20T12:00:00.000Z"),
    );

    const home = await SELF.fetch("https://example.com/");
    const page = await SELF.fetch("https://example.com/projects/acme/demo");
    const robots = await SELF.fetch("https://example.com/robots.txt");
    const sitemap = await SELF.fetch("https://example.com/sitemap.xml");
    const sitemapText = await sitemap.text();
    const rss = await SELF.fetch("https://example.com/rss.xml");
    const rssText = await rss.text();
    const design = await SELF.fetch("https://example.com/design");
    const designText = await design.text();
    const homeText = await home.text();

    expect(home.status).toBe(200);
    expect(homeText).toContain('<p class="site-tagline">Watch us build.</p>');
    expect(page.status).toBe(404);
    expect(design.status).toBe(200);
    expect(designText).not.toContain("Watch us build.");
    expect(designText).not.toContain('class="site-tagline"');
    expect(await robots.text()).toContain("Sitemap: /sitemap.xml");
    expect(sitemapText).toContain("/rss.xml");
    expect(sitemapText).not.toContain("/projects/acme/demo");
    expect(rss.status).toBe(200);
    expect(rss.headers.get("content-type")).toContain("application/rss+xml");
    expect(rssText).toContain('<rss version="2.0"');
    expect(rssText).toContain(
      `<lastBuildDate>${new Date("2026-04-20T12:00:00.000Z").toUTCString()}</lastBuildDate>`,
    );
    expect(rssText).toContain("<title>Acme started building Demo</title>");
    expect(rssText).toContain("<link>https://github.com/acme/demo</link>");
    expect(rssText).toContain("<dc:creator>acme</dc:creator>");
    expect(rssText).toContain("<category>Workers</category>");
    expect(rssText).toContain("<category>Pages</category>");
    expect(rssText).toContain("GitHub");
    expect(rssText).toContain("https://demo.example.com");
    expect(rssText).toContain("Welcome to demo.");
    expect(rssText).toContain("Built with Workers and Pages.");
    expect(rssText).not.toContain("Cloudflare:");
    expect(rssText).not.toContain("deploy.workers.cloudflare.com/button");
    expect(rssText).not.toContain("&lt;div");
    expect(rssText).not.toContain("[](");
    expect(rssText).toContain("<content:encoded><![CDATA[");
    expect(designText).toContain("Design language");
    expect(designText).toContain("Cloudflare chips");
    expect(designText).toContain("Workers AI");
    expect(designText).toContain("Sandbox");
  });

  it("caps feed.json and supports pagination metadata", async () => {
    await seedProjectRange(26);

    const firstPage = await SELF.fetch("https://example.com/feed.json");
    const firstPayload = (await firstPage.json()) as {
      items: Array<Record<string, unknown>>;
      page: number;
      totalItems: number;
      totalPages: number;
    };
    const secondPage = await SELF.fetch("https://example.com/feed.json?page=2");
    const secondPayload = (await secondPage.json()) as {
      items: Array<Record<string, unknown>>;
      page: number;
      totalItems: number;
      totalPages: number;
    };

    expect(firstPayload).toEqual(
      expect.objectContaining({
        page: 1,
        totalItems: 26,
        totalPages: 2,
      }),
    );
    expect(firstPayload.items).toHaveLength(24);
    expect(secondPayload).toEqual(
      expect.objectContaining({
        page: 2,
        totalItems: 26,
        totalPages: 2,
      }),
    );
    expect(secondPayload.items).toHaveLength(2);
  });

  it("supports repos whose names end in .json", async () => {
    await seedProjectRecord({
      owner: "acme",
      repo: "demo.json",
      repoUrl: "https://github.com/acme/demo.json",
    });

    const htmlResponse = await SELF.fetch(
      "https://example.com/projects/acme/demo%2Ejson",
    );
    const jsonResponse = await SELF.fetch(
      "https://example.com/projects/acme/demo%2Ejson.json",
    );
    const jsonPayload = (await jsonResponse.json()) as Record<string, unknown>;

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(200);
    expect(jsonPayload.repo).toBe("demo.json");
  });

  it("paginates the homepage in reverse chronological order", async () => {
    await seedProjectRange(26);

    const firstPage = await SELF.fetch("https://example.com/");
    const firstPageHtml = (await firstPage.text()).replaceAll("<!-- -->", "");
    const secondPage = await SELF.fetch("https://example.com/?page=2");
    const secondPageHtml = (await secondPage.text()).replaceAll("<!-- -->", "");

    expect(firstPage.status).toBe(200);
    expect(firstPageHtml).toContain("Page 1 of 2");
    expect(firstPageHtml).toContain("/?page=2");
    expect(firstPageHtml).toContain("https://github.com/acme/demo-26");
    expect(firstPageHtml).not.toContain('https://github.com/acme/demo-1"');
    expect(secondPageHtml).toContain("Page 2 of 2");
    expect(secondPageHtml).toContain("https://github.com/acme/demo-1");
  });

  it("orders the homepage by repo created date before ingestion time", async () => {
    await seedProjectRecord({
      owner: "acme",
      repo: "older-ingest-newer-repo",
      repoUrl: "https://github.com/acme/older-ingest-newer-repo",
      firstSeenAt: "2026-04-01T12:00:00.000Z",
      repoCreatedAt: "2026-04-20T12:00:00.000Z",
      repoCreationOrder: 900,
    });
    await seedProjectRecord({
      owner: "acme",
      repo: "newer-ingest-older-repo",
      repoUrl: "https://github.com/acme/newer-ingest-older-repo",
      firstSeenAt: "2026-04-20T12:00:00.000Z",
      repoCreatedAt: "2026-04-01T12:00:00.000Z",
      repoCreationOrder: 100,
    });

    const html = (
      await (await SELF.fetch("https://example.com/")).text()
    ).replaceAll("<!-- -->", "");

    expect(
      html.indexOf("https://github.com/acme/older-ingest-newer-repo"),
    ).toBeLessThan(
      html.indexOf("https://github.com/acme/newer-ingest-older-repo"),
    );
  });

  it("renders the team directory alphabetically with mobile and desktop navigation affordances", async () => {
    await seedProjectRecord({
      owner: "craigsdennis",
      repo: "booth-duty",
      repoUrl: "https://github.com/craigsdennis/booth-duty",
      repoCreatedAt: "2026-04-18T07:06:50.000Z",
      repoCreationOrder: 100,
    });
    await seedProjectRecord({
      owner: "adewale",
      repo: "demoscene",
      repoUrl: "https://github.com/adewale/demoscene",
      repoCreatedAt: "2026-04-21T15:48:24.000Z",
      repoCreationOrder: 200,
    });
    await seedProjectRecord({
      owner: "adewale",
      repo: "edge-dashboard-kit",
      repoUrl: "https://github.com/adewale/edge-dashboard-kit",
      repoCreatedAt: "2026-04-20T18:12:00.000Z",
      repoCreationOrder: 180,
    });

    const html = (
      await (await SELF.fetch("https://example.com/")).text()
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("|||</span><span>Team members</span>");
    expect(html).not.toContain(
      '>Directory</p><h2 class="team-directory-title">Team members</h2>',
    );
    expect(html).toContain(
      '<section aria-label="Team members" class="card team-directory-panel">',
    );
    expect(html).toContain(
      '<p class="team-directory-heading">Cloudflare DevRel</p>',
    );
    expect(html).not.toContain("2 projects");
    expect(html).not.toContain("team-card-project-count");
    expect(html).not.toContain("team-card-latest");
    expect(html.indexOf('data-team-member-login="adewale"')).toBeLessThan(
      html.indexOf('data-team-member-login="megaconfidence"'),
    );
    expect(
      html.indexOf('data-team-member-login="megaconfidence"'),
    ).toBeLessThan(html.indexOf('data-team-member-login="craigsdennis"'));
  });

  it("breaks repo created date ties with repo creation order", async () => {
    await seedProjectRecord({
      owner: "acme",
      repo: "same-day-newer-repo",
      repoUrl: "https://github.com/acme/same-day-newer-repo",
      firstSeenAt: "2026-04-20T12:00:00.000Z",
      repoCreatedAt: "2026-04-20T12:00:00.000Z",
      repoCreationOrder: 900,
    });
    await seedProjectRecord({
      owner: "acme",
      repo: "same-day-older-repo",
      repoUrl: "https://github.com/acme/same-day-older-repo",
      firstSeenAt: "2026-04-20T12:00:00.000Z",
      repoCreatedAt: "2026-04-20T12:00:00.000Z",
      repoCreationOrder: 100,
    });

    const html = (
      await (await SELF.fetch("https://example.com/")).text()
    ).replaceAll("<!-- -->", "");

    expect(
      html.indexOf("https://github.com/acme/same-day-newer-repo"),
    ).toBeLessThan(html.indexOf("https://github.com/acme/same-day-older-repo"));
  });

  it("wires the scheduled handler through waitUntil", async () => {
    const mockFetch = createMockFetch(
      buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
    );

    vi.stubGlobal("fetch", mockFetch as typeof fetch);
    const waitUntil = vi.fn();

    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    worker.scheduled?.(
      {
        cron: "0 12 * * *",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('"event":"sync.summary"'),
    );
    consoleLog.mockRestore();
    vi.unstubAllGlobals();
  });

  it("persists successful scheduled sync runs", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch(
        buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
      ) as typeof fetch,
    );

    const waitUntil = vi.fn();

    worker.scheduled?.(
      {
        cron: "0 12 * * *",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    await waitUntil.mock.calls[0][0];

    const syncRun = await fetchLatestSyncRun();

    expect(syncRun).toEqual(
      expect.objectContaining({
        cron: "0 12 * * *",
        error_message: null,
        mode: "incremental",
        status: "succeeded",
      }),
    );
    expect(syncRun?.finished_at).toBeTruthy();
    expect(syncRun?.started_at).toBeTruthy();
    expect(syncRun?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(syncRun?.planned_owner_count).toBe(TEAM_MEMBERS.length);
    expect(syncRun?.processed_owner_count).toBeGreaterThan(0);
    expect(JSON.parse(syncRun?.summary_json ?? "{}")).toEqual(
      expect.objectContaining({ accountsScanned: expect.any(Number) }),
    );

    vi.unstubAllGlobals();
  });

  it("persists failed scheduled sync runs with the captured error", async () => {
    await testEnv.DB.prepare("DROP TABLE repository_scan_state").run();
    vi.stubGlobal("fetch", createMockFetch({}) as typeof fetch);

    const waitUntil = vi.fn();

    worker.scheduled?.(
      {
        cron: "0 12 * * *",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow(
      /repository_scan_state/i,
    );

    const syncRun = await fetchLatestSyncRun();

    expect(syncRun).toEqual(
      expect.objectContaining({
        cron: "0 12 * * *",
        mode: "incremental",
        status: "failed",
      }),
    );
    expect(syncRun?.summary_json).toBeNull();
    expect(syncRun?.error_message).toMatch(/repository_scan_state/i);

    vi.unstubAllGlobals();
  });

  it("stores a resume cursor when discovery stops at a rate-limited owner", async () => {
    const responses: Record<string, MockResponse> = {};

    for (const member of TEAM_MEMBERS.slice(0, 2)) {
      responses[buildUserRepositoriesApiUrl(member.login, 1)] =
        buildUserRepositoriesApiResponse({
          login: member.login,
          repositories: [],
        });
    }

    responses[buildUserRepositoriesApiUrl(TEAM_MEMBERS[2]?.login ?? "", 1)] =
      buildRateLimitedResponse();

    await syncRepositories(testEnv, {
      fetch: createMockFetch(responses) as typeof fetch,
      mode: "incremental",
      now: new Date("2026-04-27T12:00:00.000Z"),
    });

    await expect(fetchSyncState()).resolves.toEqual(
      expect.objectContaining({
        next_owner_cursor: 2,
      }),
    );
  });

  it("records pending repositories when repo processing is rate-limited and resumes them first on the next run", async () => {
    const firstRunResponses: Record<string, MockResponse> = {};

    for (const member of TEAM_MEMBERS) {
      firstRunResponses[buildUserRepositoriesApiUrl(member.login, 1)] =
        buildUserRepositoriesApiResponse({
          login: member.login,
          repositories:
            member.login === TEAM_MEMBERS[0]?.login
              ? [{ repo: "demo", repoId: 12345 }]
              : [],
        });
    }

    firstRunResponses[
      `https://raw.githubusercontent.com/${TEAM_MEMBERS[0]?.login}/demo/main/wrangler.toml`
    ] = buildRateLimitedResponse();

    const firstSummary = await syncRepositories(testEnv, {
      fetch: createMockFetch(firstRunResponses) as typeof fetch,
      mode: "incremental",
      now: new Date("2026-04-27T12:00:00.000Z"),
    });

    expect(firstSummary.reposDeferredByRateLimit).toBe(1);
    expect(await fetchSyncState()).toEqual(
      expect.objectContaining({
        pending_repository_urls_json: JSON.stringify([
          `https://github.com/${TEAM_MEMBERS[0]?.login}/demo`,
        ]),
      }),
    );

    const secondRunResponses: Record<string, MockResponse> = {};

    for (const member of TEAM_MEMBERS) {
      secondRunResponses[buildUserRepositoriesApiUrl(member.login, 1)] =
        buildUserRepositoriesApiResponse({
          login: member.login,
          repositories: [],
        });
    }

    Object.assign(secondRunResponses, {
      [buildRepositoryApiUrl(TEAM_MEMBERS[0]?.login ?? "", "demo")]:
        buildRepositoryApiResponse({
          owner: TEAM_MEMBERS[0]?.login ?? "adewale",
          repo: "demo",
        }),
      [`https://github.com/${TEAM_MEMBERS[0]?.login}/demo`]: {
        body: buildRepositoryHomepageHtml("https://demo.example.com"),
      },
      [`https://raw.githubusercontent.com/${TEAM_MEMBERS[0]?.login}/demo/main/wrangler.toml`]:
        {
          body: `name = "demo"`,
        },
      [`https://raw.githubusercontent.com/${TEAM_MEMBERS[0]?.login}/demo/main/README.md`]:
        {
          body: "# Demo",
        },
    });

    await syncRepositories(testEnv, {
      fetch: createMockFetch(secondRunResponses) as typeof fetch,
      mode: "incremental",
      now: new Date("2026-04-27T13:00:00.000Z"),
    });

    expect(await fetchSyncState()).toEqual(
      expect.objectContaining({ pending_repository_urls_json: "[]" }),
    );
    expect(await fetchFeedItems()).toHaveLength(1);
  });

  it("uses daily incremental verification for missing repos before weekly reconcile pruning", async () => {
    await seedProjectRecord({
      owner: "adewale",
      repo: "missing-repo",
      repoUrl: "https://github.com/adewale/missing-repo",
    });

    const mockFetch = createMockFetch({
      [buildUserRepositoriesApiUrl("adewale", 1)]:
        buildUserRepositoriesApiResponse({
          login: "adewale",
          repositories: [],
        }),
      [buildRepositoryApiUrl("adewale", "missing-repo")]: {
        body: "missing",
        status: 404,
      },
    });

    vi.stubGlobal("fetch", mockFetch as typeof fetch);

    const waitUntil = vi.fn();

    worker.scheduled?.(
      {
        cron: "0 12 * * *",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    await waitUntil.mock.calls[0][0];
    expect(await fetchFeedItems()).toHaveLength(0);

    worker.scheduled?.(
      {
        cron: "17 3 * * SUN",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    await waitUntil.mock.calls[1][0];
    expect(await fetchFeedItems()).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it("keeps deployed debug sync routes disabled without a matching token", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch(
        buildDemoRepositoryResponses({
          repoPageBody: buildRepositoryHomepageHtml("https://demo.example.com"),
        }),
      ) as typeof fetch,
    );

    const disabledResponse = await app.fetch(
      new Request("https://example.com/debug/sync"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );
    const enabledResponse = await app.fetch(
      new Request("https://example.com/debug/sync"),
      {
        ...testEnv,
        DEBUG_SYNC_TOKEN: "secret-token",
        ENABLE_DEBUG_ROUTES: "true",
      },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    expect(disabledResponse.status).toBe(404);
    expect(enabledResponse.status).toBe(404);
    vi.unstubAllGlobals();
  });

  it("allows localhost debug sync without a token and deployed debug sync with the right token", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch(
        buildDemoRepositoryResponses({
          repoPageBody: buildRepositoryHomepageHtml("https://demo.example.com"),
        }),
      ) as typeof fetch,
    );

    const localResponse = await app.fetch(
      new Request("http://127.0.0.1/debug/sync"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );
    const remoteResponse = await app.fetch(
      new Request("https://example.com/debug/sync", {
        headers: { "x-debug-sync-token": "secret-token" },
      }),
      {
        ...testEnv,
        DEBUG_SYNC_TOKEN: "secret-token",
        ENABLE_DEBUG_ROUTES: "true",
      },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    expect(localResponse.status).toBe(200);
    expect(remoteResponse.status).toBe(200);
    await expect(localResponse.json()).resolves.toEqual(
      expect.objectContaining({
        accountsScanned: expect.any(Number),
        reposDiscovered: expect.any(Number),
      }),
    );
    await expect(remoteResponse.json()).resolves.toEqual(
      expect.objectContaining({
        accountsScanned: expect.any(Number),
        reposDiscovered: expect.any(Number),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("can run the scheduled sync path through the local debug route", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch(
        buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
      ) as typeof fetch,
    );
    const waitUntil = vi.fn();

    const response = await app.fetch(
      new Request("http://127.0.0.1/debug/sync?scheduled=true&cron=0+12+*+*+*"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];

    const payload = (await response.json()) as {
      accepted: boolean;
      cron: string;
    };
    const syncRun = await fetchLatestSyncRun();

    expect(response.status).toBe(202);
    expect(payload).toEqual({ accepted: true, cron: "0 12 * * *" });
    expect(syncRun).toEqual(
      expect.objectContaining({
        cron: "0 12 * * *",
        error_message: null,
        mode: "incremental",
        status: "succeeded",
      }),
    );

    vi.unstubAllGlobals();
  });

  it("exposes the latest scheduled run through debug operator tooling", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch(
        buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
      ) as typeof fetch,
    );

    const waitUntil = vi.fn();

    const triggerResponse = await app.fetch(
      new Request("http://127.0.0.1/debug/sync?scheduled=true&cron=0+12+*+*+*"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    expect(triggerResponse.status).toBe(202);
    await waitUntil.mock.calls[0][0];

    const latestResponse = await app.fetch(
      new Request("http://127.0.0.1/debug/sync-runs/latest"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    await expect(latestResponse.json()).resolves.toEqual(
      expect.objectContaining({
        cron: "0 12 * * *",
        status: "succeeded",
      }),
    );

    vi.unstubAllGlobals();
  });

  it("exposes the latest failed and rate-limited runs through debug operator tooling", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch({
        [buildUserRepositoriesApiUrl(TEAM_MEMBERS[0]?.login ?? "", 1)]:
          buildRateLimitedResponse(),
      }) as typeof fetch,
    );

    const waitUntil = vi.fn();

    worker.scheduled?.(
      {
        cron: "0 12 * * *",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    await waitUntil.mock.calls[0][0];

    const rateLimitedResponse = await app.fetch(
      new Request("http://127.0.0.1/debug/sync-runs/latest-rate-limited"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    await expect(rateLimitedResponse.json()).resolves.toEqual(
      expect.objectContaining({
        cron: "0 12 * * *",
        rateLimitedUntil: expect.any(String),
        reposDeferredByRateLimit: expect.any(Number),
      }),
    );

    await testEnv.DB.prepare("DROP TABLE repository_scan_state").run();

    worker.scheduled?.(
      {
        cron: "0 12 * * *",
        scheduledTime: Date.now(),
        noRetry: () => {},
      } as ScheduledController,
      testEnv,
      {
        waitUntil,
        passThroughOnException: () => {},
      } as unknown as ExecutionContext,
    );

    await expect(waitUntil.mock.calls[1][0]).rejects.toThrow();

    const failedResponse = await app.fetch(
      new Request("http://127.0.0.1/debug/sync-runs/latest-failed"),
      { ...testEnv, ENABLE_DEBUG_ROUTES: "false" },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    await expect(failedResponse.json()).resolves.toEqual(
      expect.objectContaining({ status: "failed" }),
    );

    vi.unstubAllGlobals();
  });

  it("allows debug sync to be limited to specific team members", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch({
        [buildUserRepositoriesApiUrl("adewale", 1)]:
          buildUserRepositoriesApiResponse({
            login: "adewale",
            repositories: [{ repo: "demo", repoId: 12345 }],
          }),
        "https://github.com/adewale/demo": {
          body: buildRepositoryHomepageHtml("https://demo.example.com"),
        },
        "https://raw.githubusercontent.com/adewale/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/adewale/demo/main/README.md": {
          body: "# Demo",
        },
      }) as typeof fetch,
    );

    const response = await app.fetch(
      new Request("https://example.com/debug/sync?member=adewale", {
        headers: { "x-debug-sync-token": "secret-token" },
      }),
      {
        ...testEnv,
        DEBUG_SYNC_TOKEN: "secret-token",
        ENABLE_DEBUG_ROUTES: "true",
      },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        accountsScanned: 1,
        reposAdded: 1,
      }),
    );

    vi.unstubAllGlobals();
  });

  it("allows debug sync to be limited to explicit repo URLs", async () => {
    vi.stubGlobal(
      "fetch",
      createMockFetch({
        [buildRepositoryApiUrl("yusukebe", "demo")]: buildRepositoryApiResponse(
          {
            owner: "yusukebe",
            repo: "demo",
          },
        ),
        "https://github.com/yusukebe/demo": {
          body: buildRepositoryHomepageHtml("https://demo.example.com"),
        },
        "https://raw.githubusercontent.com/yusukebe/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/yusukebe/demo/main/README.md": {
          body: "# Demo",
        },
      }) as typeof fetch,
    );

    const response = await app.fetch(
      new Request(
        "https://example.com/debug/sync?repo=https%3A%2F%2Fgithub.com%2Fyusukebe%2Fdemo",
        {
          headers: { "x-debug-sync-token": "secret-token" },
        },
      ),
      {
        ...testEnv,
        DEBUG_SYNC_TOKEN: "secret-token",
        ENABLE_DEBUG_ROUTES: "true",
      },
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        accountsScanned: 0,
        reposAdded: 1,
      }),
    );

    vi.unstubAllGlobals();
  });
});
