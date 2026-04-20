import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  discoverRepositoriesForTeamMember,
  fetchFirstAvailableRawFile,
  fetchRepositoryMetadata,
  fetchRepositoryPage,
  validatePreviewImageUrl,
} from "../../src/lib/github/fetch";
import {
  buildRepositoryApiUrl,
  buildUserRepositoriesApiUrl,
  parseRepositoryUrl,
} from "../../src/lib/github/repositories";

type MockResponse = {
  body: string;
  headers?: Record<string, string>;
  status?: number;
};

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

function buildRepositoriesApiResponse(options: {
  login: string;
  nextPage?: number;
  repositories: Array<{ createdAt: string; repo: string; repoId: number }>;
}): MockResponse {
  return {
    body: JSON.stringify(
      options.repositories.map((repository) => ({
        created_at: repository.createdAt,
        default_branch: "main",
        homepage: "https://demo.example.com",
        html_url: `https://github.com/${options.login}/${repository.repo}`,
        id: repository.repoId,
        name: repository.repo,
        owner: { login: options.login },
      })),
    ),
    headers: {
      "content-type": "application/json",
      ...(options.nextPage
        ? {
            link: `<${buildUserRepositoriesApiUrl(options.login, options.nextPage)}>; rel="next"`,
          }
        : {}),
    },
  };
}

describe("discoverRepositoriesForTeamMember", () => {
  it("keeps paging until GitHub stops returning a next link", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 15 }), async (pageCount) => {
        const responses: Record<string, MockResponse> = {};

        for (let page = 1; page <= pageCount; page += 1) {
          responses[buildUserRepositoriesApiUrl("adewale", page)] =
            buildRepositoriesApiResponse({
              login: "adewale",
              nextPage: page < pageCount ? page + 1 : undefined,
              repositories: [
                {
                  createdAt: `2026-04-${String(pageCount - page + 1).padStart(2, "0")}T12:00:00.000Z`,
                  repo: `repo-${page}`,
                  repoId: pageCount - page + 1,
                },
              ],
            });
        }

        const repositories = await discoverRepositoriesForTeamMember(
          createMockFetch(responses) as typeof fetch,
          { login: "adewale", name: "Ade" },
        );

        expect(repositories).toHaveLength(pageCount);
        expect(repositories.map((repository) => repository.repo)).toEqual(
          Array.from({ length: pageCount }, (_, index) => `repo-${index + 1}`),
        );
      }),
    );
  });

  it("fails loudly when an explicit page cap is exceeded before discovery completes", async () => {
    await expect(
      discoverRepositoriesForTeamMember(
        createMockFetch({
          [buildUserRepositoriesApiUrl("adewale", 1)]:
            buildRepositoriesApiResponse({
              login: "adewale",
              nextPage: 2,
              repositories: [
                {
                  createdAt: "2026-04-02T12:00:00.000Z",
                  repo: "repo-1",
                  repoId: 2,
                },
              ],
            }),
        }) as typeof fetch,
        { login: "adewale", name: "Ade" },
        undefined,
        1,
      ),
    ).rejects.toThrow("exceeded page limit");
  });

  it("sorts same-timestamp repositories by repository id and rejects invalid payloads", async () => {
    await expect(
      discoverRepositoriesForTeamMember(
        createMockFetch({
          [buildUserRepositoriesApiUrl("adewale", 1)]: {
            body: JSON.stringify([
              {
                created_at: "2026-04-02T12:00:00.000Z",
                html_url: "https://github.com/adewale/repo-b",
                id: 2,
                name: "repo-b",
                owner: { login: "adewale" },
              },
              {
                created_at: "2026-04-02T12:00:00.000Z",
                html_url: "https://github.com/adewale/repo-a",
                id: 3,
                name: "repo-a",
                owner: { login: "adewale" },
              },
            ]),
            headers: { "content-type": "application/json" },
          },
        }) as typeof fetch,
        { login: "adewale", name: "Ade" },
      ),
    ).resolves.toMatchObject([
      { repo: "repo-a", repoCreationOrder: 3 },
      { repo: "repo-b", repoCreationOrder: 2 },
    ]);

    await expect(
      discoverRepositoriesForTeamMember(
        createMockFetch({
          [buildUserRepositoriesApiUrl("adewale", 1)]: {
            body: JSON.stringify({ invalid: true }),
            headers: { "content-type": "application/json" },
          },
        }) as typeof fetch,
        { login: "adewale", name: "Ade" },
      ),
    ).rejects.toThrow("Invalid repository payload");
  });
});

describe("fetchRepositoryPage", () => {
  const repository = parseRepositoryUrl("https://github.com/acme/demo");

  it("returns found HTML for successful repository pages", async () => {
    await expect(
      fetchRepositoryPage(
        createMockFetch({
          "https://github.com/acme/demo": { body: "<html>demo</html>" },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "found", html: "<html>demo</html>" });
  });

  it("treats missing repository pages as not found", async () => {
    await expect(
      fetchRepositoryPage(
        createMockFetch({
          "https://github.com/acme/demo": { body: "missing", status: 404 },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("treats non-404 repository page failures as transient", async () => {
    await expect(
      fetchRepositoryPage(
        createMockFetch({
          "https://github.com/acme/demo": { body: "retry", status: 500 },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "transient_error" });
  });

  it("treats failed repository page fetches as transient", async () => {
    await expect(
      fetchRepositoryPage(
        vi.fn(async () => {
          throw new Error("boom");
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "transient_error" });
  });
});

describe("validatePreviewImageUrl", () => {
  it("accepts valid image responses from HEAD", async () => {
    await expect(
      validatePreviewImageUrl(
        createMockFetch({
          "https://images.example.com/demo.png": {
            body: "binary",
            headers: { "content-type": "image/png" },
          },
        }) as typeof fetch,
        "https://images.example.com/demo.png",
      ),
    ).resolves.toEqual({
      kind: "valid",
      url: "https://images.example.com/demo.png",
    });
  });

  it("retries with GET after a transient HEAD failure", async () => {
    let attempts = 0;

    await expect(
      validatePreviewImageUrl(
        vi.fn(async (input: string | URL | Request) => {
          attempts += 1;
          const request = input instanceof Request ? input : new Request(input);

          if (request.method === "HEAD") {
            return new Response("retry", { status: 503 });
          }

          return new Response("binary", {
            headers: { "content-type": "image/png" },
            status: 200,
          });
        }) as typeof fetch,
        "https://images.example.com/demo.png",
      ),
    ).resolves.toEqual({
      kind: "valid",
      url: "https://images.example.com/demo.png",
    });
    expect(attempts).toBe(2);
  });

  it("returns missing for empty or broken image candidates", async () => {
    await expect(
      validatePreviewImageUrl(createMockFetch({}) as typeof fetch, null),
    ).resolves.toEqual({ kind: "missing" });
    await expect(
      validatePreviewImageUrl(
        createMockFetch({
          "https://images.example.com/demo.png": {
            body: "missing",
            status: 404,
          },
        }) as typeof fetch,
        "https://images.example.com/demo.png",
      ),
    ).resolves.toEqual({ kind: "missing" });
    await expect(
      validatePreviewImageUrl(
        createMockFetch({
          "https://images.example.com/demo.png": {
            body: "html",
            headers: { "content-type": "text/html" },
          },
        }) as typeof fetch,
        "https://images.example.com/demo.png",
      ),
    ).resolves.toEqual({ kind: "missing" });
  });

  it("returns a transient error when both HEAD and GET fail", async () => {
    await expect(
      validatePreviewImageUrl(
        createMockFetch({
          "https://images.example.com/demo.png": {
            body: "retry",
            status: 503,
          },
        }) as typeof fetch,
        "https://images.example.com/demo.png",
      ),
    ).resolves.toEqual({ kind: "transient_error" });
  });
});

describe("fetchRepositoryMetadata", () => {
  const repository = parseRepositoryUrl("https://github.com/acme/demo");

  it("parses GitHub repository metadata", async () => {
    await expect(
      fetchRepositoryMetadata(
        createMockFetch({
          [buildRepositoryApiUrl("acme", "demo")]: {
            body: JSON.stringify({
              created_at: "2026-04-20T12:00:00.000Z",
              default_branch: "main",
              homepage: "https://demo.example.com",
              html_url: "https://github.com/acme/demo",
              id: 123,
              name: "demo",
              owner: { login: "acme" },
            }),
            headers: { "content-type": "application/json" },
          },
        }) as typeof fetch,
        repository,
        "token",
      ),
    ).resolves.toEqual({
      kind: "found",
      metadata: {
        defaultBranch: "main",
        homepageUrl: "https://demo.example.com",
        owner: "acme",
        repo: "demo",
        repoCreatedAt: "2026-04-20T12:00:00.000Z",
        repoCreationOrder: 123,
        slug: "acme/demo",
        url: "https://github.com/acme/demo",
      },
    });
  });

  it("classifies not found, transient, and invalid metadata responses", async () => {
    await expect(
      fetchRepositoryMetadata(
        createMockFetch({
          [buildRepositoryApiUrl("acme", "demo")]: {
            body: "missing",
            status: 404,
          },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      fetchRepositoryMetadata(
        createMockFetch({
          [buildRepositoryApiUrl("acme", "demo")]: {
            body: "retry",
            status: 503,
          },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "transient_error" });
    await expect(
      fetchRepositoryMetadata(
        createMockFetch({
          [buildRepositoryApiUrl("acme", "demo")]: {
            body: JSON.stringify({ html_url: "https://github.com/acme/demo" }),
            headers: { "content-type": "application/json" },
          },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "transient_error" });
    await expect(
      fetchRepositoryMetadata(
        createMockFetch({
          [buildRepositoryApiUrl("acme", "demo")]: {
            body: "forbidden",
            status: 422,
          },
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      fetchRepositoryMetadata(
        vi.fn(async () => {
          throw new Error("boom");
        }) as typeof fetch,
        repository,
      ),
    ).resolves.toEqual({ kind: "transient_error" });
  });
});

describe("fetchFirstAvailableRawFile", () => {
  const repository = parseRepositoryUrl("https://github.com/acme/demo");

  it("uses the preferred branch before fallback branches", async () => {
    await expect(
      fetchFirstAvailableRawFile(
        createMockFetch({
          "https://raw.githubusercontent.com/acme/demo/dev/README.md": {
            body: "# Demo",
          },
        }) as typeof fetch,
        repository,
        ["README.md"],
        "dev",
      ),
    ).resolves.toEqual({
      kind: "found",
      file: {
        branch: "dev",
        contents: "# Demo",
        fileName: "README.md",
      },
    });
  });

  it("reports not found and transient raw file failures separately", async () => {
    await expect(
      fetchFirstAvailableRawFile(
        createMockFetch({}) as typeof fetch,
        repository,
        ["README.md"],
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      fetchFirstAvailableRawFile(
        createMockFetch({
          "https://raw.githubusercontent.com/acme/demo/main/README.md": {
            body: "retry",
            status: 503,
          },
          "https://raw.githubusercontent.com/acme/demo/master/README.md": {
            body: "retry",
            status: 503,
          },
        }) as typeof fetch,
        repository,
        ["README.md"],
      ),
    ).resolves.toEqual({ kind: "transient_error" });
    await expect(
      fetchFirstAvailableRawFile(
        createMockFetch({
          "https://raw.githubusercontent.com/acme/demo/main/README.md": {
            body: "bad request",
            status: 400,
          },
          "https://raw.githubusercontent.com/acme/demo/master/README.md": {
            body: "missing",
            status: 404,
          },
        }) as typeof fetch,
        repository,
        ["README.md"],
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      fetchFirstAvailableRawFile(
        vi.fn(async (input: string | URL | Request) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          if (url.includes("/main/")) {
            throw new Error("boom");
          }

          return new Response("missing", { status: 404 });
        }) as typeof fetch,
        repository,
        ["README.md"],
      ),
    ).resolves.toEqual({ kind: "transient_error" });
  });
});
