import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildRawFileCandidates,
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
});
