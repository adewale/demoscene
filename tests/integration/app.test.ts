import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../src/domain";
import worker, { syncRepositories } from "../../src/index";
import { SCHEMA_SQL } from "../../src/db/schema-sql";

type MockResponse = {
  body: string;
  status?: number;
};

const testEnv = env as unknown as AppEnv;

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
  for (const statement of SCHEMA_SQL.split(";")
    .map((value) => value.trim())
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

  it("keeps the original README while refreshing homepage metadata", async () => {
    const repositoryUrl = "https://github.com/acme/demo";

    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [repositoryUrl]: {
          body: `<a data-testid="repository-homepage-url" href="https://v1.example.com">demo</a>`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: "# Demo\n\nOriginal README.",
        },
      }) as typeof fetch,
      now: new Date("2026-04-14T12:00:00.000Z"),
      repositories: [repositoryUrl],
    });

    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [repositoryUrl]: {
          body: `<a data-testid="repository-homepage-url" href="https://v2.example.com">demo</a>`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: "# Demo\n\nChanged README.",
        },
      }) as typeof fetch,
      now: new Date("2026-04-15T12:00:00.000Z"),
      repositories: [repositoryUrl],
    });

    const response = await SELF.fetch(
      "https://example.com/projects/acme/demo.json",
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.homepageUrl).toBe("https://v2.example.com");
    expect(payload.readmeMarkdown).toBe("# Demo\n\nOriginal README.");
  });

  it("removes repos that can no longer be found", async () => {
    const repositoryUrl = "https://github.com/acme/demo";

    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [repositoryUrl]: { body: "<html></html>" },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: `name = "demo"`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: "# Demo",
        },
      }) as typeof fetch,
      repositories: [repositoryUrl],
    });

    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        [repositoryUrl]: { body: "missing", status: 404 },
      }) as typeof fetch,
      repositories: [repositoryUrl],
    });

    const response = await SELF.fetch("https://example.com/feed.json");
    const payload = (await response.json()) as { items: unknown[] };

    expect(payload.items).toHaveLength(0);
  });

  it("renders HTML routes and support routes", async () => {
    await syncRepositories(testEnv, {
      fetch: createMockFetch({
        "https://github.com/acme/demo": {
          body: `<a data-testid="repository-homepage-url" href="https://demo.example.com">demo</a>`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
          body: `pages_build_output_dir = "dist"`,
        },
        "https://raw.githubusercontent.com/acme/demo/main/README.md": {
          body: "# Demo\n\nWelcome to **demo**.",
        },
      }) as typeof fetch,
      repositories: ["https://github.com/acme/demo"],
    });

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

  it("wires the scheduled handler through waitUntil", async () => {
    const mockFetch = createMockFetch({
      "https://github.com/acme/demo": { body: "<html></html>" },
      "https://raw.githubusercontent.com/acme/demo/main/wrangler.toml": {
        body: `name = "demo"`,
      },
      "https://raw.githubusercontent.com/acme/demo/main/README.md": {
        body: "# Demo",
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

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    vi.unstubAllGlobals();
  });
});
