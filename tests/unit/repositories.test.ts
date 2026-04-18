import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildRawFileCandidates,
  buildRepositoriesPageUrl,
  extractRepositoryUrlsFromAccountPage,
  normalizeRepositoryUrl,
  parseRepositoryUrl,
} from "../../src/lib/github/repositories";
import ACCOUNT_LAST_PAGE_FIXTURE from "../fixtures/github/profile-repositories-adewale-last-page.html?raw";
import ACCOUNT_PAGE_FIXTURE from "../fixtures/github/profile-repositories-adewale-page-1.html?raw";

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
});

describe("GitHub account discovery", () => {
  it("builds repository listing URLs", () => {
    expect(buildRepositoriesPageUrl("adewale", 2)).toBe(
      "https://github.com/adewale?page=2&tab=repositories",
    );
  });

  it("extracts repository URLs and pagination from account HTML", () => {
    const html = `
      <html>
        <body>
          <a itemprop="name codeRepository" href="/adewale/demo-one">demo-one</a>
          <a data-hovercard-type="repository" href="/adewale/demo-two">demo-two</a>
          <a rel="next" href="/adewale?page=2&tab=repositories">Next</a>
        </body>
      </html>
    `;

    expect(extractRepositoryUrlsFromAccountPage(html, "adewale")).toEqual({
      hasNextPage: true,
      repositoryUrls: [
        "https://github.com/adewale/demo-one",
        "https://github.com/adewale/demo-two",
      ],
    });
  });

  it("handles single-quoted attributes and ignores non-repo links", () => {
    const html = `
      <html>
        <body>
          <a itemprop='name codeRepository' href='/adewale/demo-three'>demo-three</a>
          <a itemprop='name codeRepository'>missing-href</a>
          <a data-hovercard-type='repository' href='/someone-else/demo-four'>demo-four</a>
          <a href='/adewale/not-a-repo'>not-a-repo</a>
          <a aria-label='Next' href='/adewale?page=2&tab=repositories'>Next</a>
        </body>
      </html>
    `;

    expect(extractRepositoryUrlsFromAccountPage(html, "adewale")).toEqual({
      hasNextPage: true,
      repositoryUrls: ["https://github.com/adewale/demo-three"],
    });
  });

  it("reports no pagination when no next-page hint exists", () => {
    const html = `
      <html>
        <body>
          <a itemprop="name codeRepository" href="/adewale/demo-five">demo-five</a>
        </body>
      </html>
    `;

    expect(extractRepositoryUrlsFromAccountPage(html, "adewale")).toEqual({
      hasNextPage: false,
      repositoryUrls: ["https://github.com/adewale/demo-five"],
    });
  });

  it("extracts repo URLs and next-page state from a realistic account fixture", () => {
    expect(
      extractRepositoryUrlsFromAccountPage(ACCOUNT_PAGE_FIXTURE, "adewale"),
    ).toEqual({
      hasNextPage: true,
      repositoryUrls: [
        "https://github.com/adewale/bobbin",
        "https://github.com/adewale/cf-workers-design-system",
      ],
    });
  });

  it("detects a realistic last page with no next link", () => {
    expect(
      extractRepositoryUrlsFromAccountPage(
        ACCOUNT_LAST_PAGE_FIXTURE,
        "adewale",
      ),
    ).toEqual({
      hasNextPage: false,
      repositoryUrls: [
        "https://github.com/adewale/fibonacci_durable_object",
        "https://github.com/adewale/next-starter-template",
      ],
    });
  });

  it("dedupes and sorts arbitrary valid repo anchors", () => {
    fc.assert(
      fc.property(
        fc.array(repoArbitrary, { minLength: 1, maxLength: 8 }),
        (repos) => {
          const html = repos
            .concat(repos[0] ?? [])
            .map(
              (repo) =>
                `<a href="/adewale/${repo}" itemprop="name codeRepository">${repo}</a>`,
            )
            .join("\n");

          expect(
            extractRepositoryUrlsFromAccountPage(html, "adewale")
              .repositoryUrls,
          ).toEqual(
            [...new Set(repos)]
              .sort()
              .map((repo) => `https://github.com/adewale/${repo}`),
          );
        },
      ),
    );
  });
});
