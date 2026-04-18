import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../src/domain";
import worker, { syncRepositories } from "../../src/index";
import MIGRATION_SQL from "../../migrations/0001_initial.sql?raw";

type MockResponse = {
  body: string;
  status?: number;
};

const testEnv = env as unknown as AppEnv;
const DEMO_REPOSITORY_URL = "https://github.com/acme/demo";

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

async function seedProjectRecord(values: {
  owner: string;
  repo: string;
  repoUrl: string;
}) {
  await testEnv.DB.prepare(
    `INSERT INTO projects (
      slug, owner, repo, repo_url, homepage_url, branch, wrangler_path, wrangler_format,
      readme_markdown, readme_preview_markdown, preview_image_url, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `${values.owner}/${values.repo}`,
      values.owner,
      values.repo,
      values.repoUrl,
      "https://demo.example.com",
      "main",
      "wrangler.toml",
      "toml",
      "# Demo Json",
      "# Demo Json",
      null,
      "2026-04-14T12:00:00.000Z",
      "2026-04-14T12:00:00.000Z",
    )
    .run();
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

    return new Response(response.body, { status: response.status ?? 200 });
  });
}

async function resetDatabase() {
  for (const statement of MIGRATION_SQL.split(";")
    .map((value: string) => value.trim())
    .filter(Boolean)) {
    await testEnv.DB.prepare(statement).run();
  }
  await testEnv.DB.prepare("DELETE FROM project_products").run();
  await testEnv.DB.prepare("DELETE FROM projects").run();
}

describe("Worker app", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("syncs a new repository and exposes card-ready feed JSON", async () => {
    const mockFetch = createMockFetch({
      "https://github.com/acme/demo": {
        body: `
          <html>
            <head>
              <meta property="og:image" content="https://images.example.com/demo.png" />
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
    expect(payload.items[0]?.readmePreviewMarkdown).toBe(
      "# Demo\n\nThe first project in the feed.",
    );
    expect(payload.items[0]?.products).toEqual([
      { key: "workers", label: "Workers" },
      { key: "pages", label: "Pages" },
      { key: "d1", label: "D1" },
    ]);
  });

  it("discovers public repos from the configured team accounts", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        "https://github.com/adewale?page=1&tab=repositories": {
          body: `
            <a itemprop="name codeRepository" href="/adewale/demo">demo</a>
          `,
        },
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
      [DEMO_REPOSITORY_URL]: { body: "missing", status: 404 },
    });

    expect(await fetchFeedItems()).toHaveLength(0);
  });

  it("keeps existing projects when Wrangler fetches fail transiently", async () => {
    await syncDemoRepository(
      buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
    );
    await syncDemoRepository({
      [DEMO_REPOSITORY_URL]: { body: "<html></html>" },
      ...buildRateLimitedWranglerResponses(),
    });

    expect(await fetchFeedItems()).toHaveLength(1);
  });

  it("renders HTML routes and support routes", async () => {
    await syncDemoRepository(
      buildDemoRepositoryResponses({
        readme: "# Demo\n\nWelcome to **demo**.",
        wrangler: `pages_build_output_dir = "dist"`,
      }),
    );

    const page = await SELF.fetch("https://example.com/projects/acme/demo");
    const html = await page.text();
    const robots = await SELF.fetch("https://example.com/robots.txt");
    const sitemap = await SELF.fetch("https://example.com/sitemap.xml");

    expect(page.status).toBe(200);
    expect(html).toContain("acme/demo");
    expect(html).toContain("Visit homepage");
    expect(await robots.text()).toContain("Sitemap: /sitemap.xml");
    expect(await sitemap.text()).toContain("/projects/acme/demo");
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

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(jsonPayload.repo).toBe("demo.json");
  });

  it("wires the scheduled handler through waitUntil", async () => {
    const mockFetch = createMockFetch(
      buildDemoRepositoryResponses({ repoPageBody: "<html></html>" }),
    );

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

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    vi.unstubAllGlobals();
  });
});
