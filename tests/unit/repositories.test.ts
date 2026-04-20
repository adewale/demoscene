import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildRawFileCandidates,
  buildRepositoryApiUrl,
  buildUserRepositoriesApiUrl,
  hasNextPageLink,
  normalizeRepositoryUrl,
  parseRepositoryUrl,
} from "../../src/lib/github/repositories";

const ownerArbitrary = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(""));

const repoArbitrary = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_."), {
    minLength: 1,
    maxLength: 30,
  })
  .map((chars) => chars.join(""))
  .filter((repo) => repo !== "." && repo !== "..");

describe("parseRepositoryUrl", () => {
  it("parses a public GitHub repository URL", () => {
    expect(
      parseRepositoryUrl("https://github.com/cloudflare/workers-sdk"),
    ).toEqual({
      owner: "cloudflare",
      repo: "workers-sdk",
      slug: "cloudflare/workers-sdk",
      url: "https://github.com/cloudflare/workers-sdk",
    });
  });

  it("rejects non-GitHub URLs", () => {
    expect(() =>
      parseRepositoryUrl("https://example.com/cloudflare/workers-sdk"),
    ).toThrow();
  });

  it("rejects GitHub URLs that are not repo paths", () => {
    expect(() =>
      parseRepositoryUrl("https://github.com/cloudflare/workers-sdk/tree/main"),
    ).toThrow("Repository URL must match");
  });

  it("normalizes trailing slashes", () => {
    expect(
      normalizeRepositoryUrl("https://github.com/cloudflare/workers-sdk/"),
    ).toBe("https://github.com/cloudflare/workers-sdk");
  });

  it("round-trips valid owner and repo pairs", () => {
    fc.assert(
      fc.property(ownerArbitrary, repoArbitrary, (owner, repo) => {
        const parsed = parseRepositoryUrl(
          `https://github.com/${owner}/${repo}`,
        );

        expect(parsed.owner).toBe(owner);
        expect(parsed.repo).toBe(repo);
        expect(parsed.slug).toBe(`${owner}/${repo}`);
      }),
    );
  });
});

describe("buildRawFileCandidates", () => {
  it("tries main before master for each file", () => {
    expect(
      buildRawFileCandidates("cloudflare", "workers-sdk", [
        "README.md",
        "wrangler.toml",
      ]),
    ).toEqual([
      {
        branch: "main",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/README.md",
      },
      {
        branch: "master",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/master/README.md",
      },
      {
        branch: "main",
        fileName: "wrangler.toml",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/wrangler.toml",
      },
      {
        branch: "master",
        fileName: "wrangler.toml",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/master/wrangler.toml",
      },
    ]);
  });

  it("prefers the provided default branch before fallback branches", () => {
    expect(
      buildRawFileCandidates("cloudflare", "workers-sdk", ["README.md"], "dev"),
    ).toEqual([
      {
        branch: "dev",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/dev/README.md",
      },
      {
        branch: "main",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/README.md",
      },
      {
        branch: "master",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/master/README.md",
      },
    ]);
  });

  it("does not duplicate fallback branches when the preferred branch already matches one", () => {
    expect(
      buildRawFileCandidates(
        "cloudflare",
        "workers-sdk",
        ["README.md"],
        "main",
      ),
    ).toEqual([
      {
        branch: "main",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/README.md",
      },
      {
        branch: "master",
        fileName: "README.md",
        url: "https://raw.githubusercontent.com/cloudflare/workers-sdk/master/README.md",
      },
    ]);
  });
});

describe("GitHub account discovery", () => {
  it("builds GitHub API repository listing URLs", () => {
    expect(buildUserRepositoriesApiUrl("a/dewale", 3, 50)).toBe(
      "https://api.github.com/users/a%2Fdewale/repos?sort=created&direction=desc&per_page=50&page=3",
    );
  });

  it("builds GitHub API repository detail URLs", () => {
    expect(buildRepositoryApiUrl("cloudflare", "workers sdk")).toBe(
      "https://api.github.com/repos/cloudflare/workers%20sdk",
    );
  });

  it("detects next-page links from GitHub API pagination headers", () => {
    expect(
      hasNextPageLink(
        '<https://api.github.com/user/1/repos?page=2>; rel="next", <https://api.github.com/user/1/repos?page=4>; rel="last"',
      ),
    ).toBe(true);
    expect(
      hasNextPageLink(
        '<https://api.github.com/user/1/repos?page=1>; rel="prev", <https://api.github.com/user/1/repos?page=4>; rel="last"',
      ),
    ).toBe(false);
    expect(hasNextPageLink(null)).toBe(false);
  });

  it("only reports next-page links when the header actually contains rel=next", () => {
    fc.assert(
      fc.property(
        fc.string().filter((value) => !/rel="?next"?/i.test(value)),
        (header) => {
          expect(hasNextPageLink(header)).toBe(false);
        },
      ),
    );
  });
});
