import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import type { ProjectWithProducts } from "../../src/domain";
import {
  getRssItems,
  getRssLastBuildDate,
  renderRssFeed,
} from "../../src/lib/rss";
import { RSS_ITEM_LIMIT } from "../../src/lib/sync-policy";

const safeDateArbitrary = fc
  .date({
    max: new Date("2035-12-31T23:59:59.999Z"),
    min: new Date("2000-01-01T00:00:00.000Z"),
  })
  .filter((date) => !Number.isNaN(date.valueOf()));

const repoWordArbitrary = fc.constantFrom(
  "agentic",
  "inbox",
  "worker",
  "cloud",
  "demo",
  "scene",
  "signal",
  "stack",
);

const ownerWordArbitrary = fc.constantFrom(
  "builder",
  "edge",
  "forge",
  "maker",
  "signal",
  "studio",
);

function humanizeSlugForExpectation(value: string): string {
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function buildProject(
  index: number,
  lastSeenAt: string,
  overrides: Partial<ProjectWithProducts> = {},
): ProjectWithProducts {
  return {
    branch: "main",
    firstSeenAt: lastSeenAt,
    homepageUrl: null,
    lastSeenAt,
    owner: `owner-${index}`,
    previewImageUrl: null,
    products: [],
    readmeMarkdown: `# Demo ${index}`,
    readmePreviewMarkdown: `Demo ${index}`,
    repo: `repo-${index}`,
    repoCreatedAt: lastSeenAt,
    repoCreationOrder: index,
    repoUrl: `https://github.com/owner-${index}/repo-${index}`,
    slug: `owner-${index}/repo-${index}`,
    wranglerFormat: "toml",
    wranglerPath: "wrangler.toml",
    ...overrides,
  };
}

describe("RSS helpers", () => {
  it("caps RSS items to the publication limit", () => {
    fc.assert(
      fc.property(
        fc.array(safeDateArbitrary, { maxLength: RSS_ITEM_LIMIT * 3 }),
        (dates) => {
          const items = dates.map((date, index) =>
            buildProject(index, date.toISOString()),
          );

          expect(getRssItems(items)).toHaveLength(
            Math.min(items.length, RSS_ITEM_LIMIT),
          );
        },
      ),
    );
  });

  it("uses the freshest lastSeenAt value for lastBuildDate", () => {
    fc.assert(
      fc.property(
        fc.array(safeDateArbitrary, { minLength: 1, maxLength: 32 }),
        (dates) => {
          const items = dates.map((date, index) =>
            buildProject(index, date.toISOString()),
          );
          const includedItems = getRssItems(items);
          const expected = includedItems
            .map((item) => item.lastSeenAt)
            .sort(
              (left, right) =>
                new Date(right).valueOf() - new Date(left).valueOf(),
            )[0];

          expect(getRssLastBuildDate(items)).toBe(expected);
        },
      ),
    );
  });

  it("falls back to the current time when there are no RSS items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:34:56.000Z"));

    expect(getRssLastBuildDate([])).toBe("2026-04-23T12:34:56.000Z");

    vi.useRealTimers();
  });

  it("renders valid XML scaffolding with bounded items", () => {
    const xml = renderRssFeed({
      items: Array.from({ length: RSS_ITEM_LIMIT + 5 }, (_, index) =>
        buildProject(
          index + 1,
          `2026-04-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
        ),
      ),
      origin: "https://example.com",
    });

    expect(xml).toContain('<rss version="2.0"');
    expect(xml.match(/<item>/g) ?? []).toHaveLength(RSS_ITEM_LIMIT);
    expect(xml).toContain("<lastBuildDate>");
  });

  it("renders a story title and body for syndicated readers", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "acme",
          previewImageUrl: "https://images.example.com/preview.png",
          products: [
            { key: "workers", label: "Workers" },
            { key: "d1", label: "D1" },
          ],
          readmeMarkdown:
            "# Agentic Inbox\n\nA clearer summary for feed readers.",
          readmePreviewMarkdown:
            "Agentic Inbox\n\nA clearer summary for feed readers.",
          repo: "agentic-inbox",
          repoUrl: "https://github.com/acme/agentic-inbox",
          slug: "acme/agentic-inbox",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<title>Acme started building Agentic Inbox</title>");
    expect(xml).toContain("<p>A clearer summary for feed readers.</p>");
    expect(xml).toContain("<p>Built with Workers and D1.</p>");
    expect(xml).not.toContain("<p>Agentic Inbox</p>");
    expect(xml).not.toContain("<p><strong>acme/agentic-inbox</strong></p>");
    expect(xml).not.toContain("Cloudflare:");
    expect(xml).not.toContain("<img src=");
  });

  it("uses a README heading as the project name in the story title", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "craigsdennis",
          homepageUrl: "https://demo.example.com",
          products: [
            { key: "workers", label: "Workers" },
            { key: "d1", label: "D1" },
          ],
          readmeMarkdown:
            "# Booth Duty\n\nVoice-first event demo with prize flow.\n\n[Live site](https://demo.example.com)",
          readmePreviewMarkdown:
            "Booth Duty\n\nVoice-first event demo with prize flow.",
          repo: "booth-duty",
          repoUrl: "https://github.com/craigsdennis/booth-duty",
          slug: "craigsdennis/booth-duty",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<title>Craig started building Booth Duty</title>");
    expect(xml).toContain("<p>Voice-first event demo with prize flow.</p>");
    expect(xml).toContain("<p>Built with Workers and D1.</p>");
    expect(xml).toContain("<category>Workers</category>");
    expect(xml).toContain("<category>D1</category>");
    expect(xml).toContain('<a href="https://demo.example.com">Live</a>');
  });

  it("uses an HTML heading as the project name when README markup already has one", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "acme",
          readmeMarkdown:
            "<h1>Edge Mail</h1>\n<p>Email triage for the edge.</p>",
          readmePreviewMarkdown: "Email triage for the edge.",
          repo: "edge-mail",
          repoUrl: "https://github.com/acme/edge-mail",
          slug: "acme/edge-mail",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<title>Acme started building Edge Mail</title>");
  });

  it("uses a setext heading as the project name when present", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "acme",
          readmeMarkdown:
            "Remote Edge Starter\n===================\n\nReference worker for remote edge endpoints.",
          readmePreviewMarkdown: "Reference worker for remote edge endpoints.",
          repo: "remote-edge-starter",
          repoUrl: "https://github.com/acme/remote-edge-starter",
          slug: "acme/remote-edge-starter",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain(
      "<title>Acme started building Remote Edge Starter</title>",
    );
  });

  it("prefers configured team-member names over login-shaped owner slugs", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "adewale",
          readmeMarkdown:
            "# Demoscene\n\nCard-oriented feed for Cloudflare projects.",
          readmePreviewMarkdown: "Card-oriented feed for Cloudflare projects.",
          repo: "demoscene",
          repoUrl: "https://github.com/adewale/demoscene",
          slug: "adewale/demoscene",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<title>Ade started building Demoscene</title>");
    expect(xml).not.toContain(
      "<title>Adewale started building Demoscene</title>",
    );
  });

  it("humanizes a slug-like README heading before using it in the story title", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "adewale",
          readmeMarkdown:
            "# demoscene\n\nCard-oriented feed for Cloudflare projects.",
          readmePreviewMarkdown:
            "demoscene\n\nCard-oriented feed for Cloudflare projects.",
          repo: "demoscene",
          repoUrl: "https://github.com/adewale/demoscene",
          slug: "adewale/demoscene",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<title>Ade started building Demoscene</title>");
    expect(xml).not.toContain("<title>Ade started building demoscene</title>");
  });

  it("drops low-signal heading-only paragraphs from RSS bodies", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          products: [
            { key: "workers", label: "Workers" },
            { key: "d1", label: "D1" },
            { key: "queues", label: "Queues" },
          ],
          readmePreviewMarkdown:
            "How it works\n\nA sharper summary for feed readers.\n\nStack\n\nWorkers, D1, and Queues.",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<p>A sharper summary for feed readers.</p>");
    expect(xml).toContain("<p>Built with Workers, D1, and Queues.</p>");
    expect(xml).not.toContain("<p>How it works</p>");
    expect(xml).not.toContain("<p>Stack</p>");
  });

  it("drops a repeated title line when the summary shares the same paragraph", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "harshil1712",
          products: [
            { key: "workers", label: "Workers" },
            { key: "agents", label: "Agents" },
          ],
          readmeMarkdown:
            "# Agentic Inbox\n\nA self-hosted email client with an AI agent, running entirely on Cloudflare Workers.",
          readmePreviewMarkdown:
            "Agentic Inbox\n  A self-hosted email client with an AI agent, running entirely on Cloudflare Workers.",
          repo: "agentic-inbox",
          repoUrl: "https://github.com/harshil1712/agentic-inbox",
          slug: "harshil1712/agentic-inbox",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain(
      "<p>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers.</p>",
    );
    expect(xml).not.toContain(
      "<p>Agentic Inbox A self-hosted email client with an AI agent, running entirely on Cloudflare Workers.</p>",
    );
  });

  it("omits the built-with sentence when there are no detected products", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "acme",
          readmeMarkdown: "# Quiet Project\n\nA small edge utility.",
          readmePreviewMarkdown: "A small edge utility.",
          repo: "quiet-project",
          repoUrl: "https://github.com/acme/quiet-project",
          slug: "acme/quiet-project",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).not.toContain("Built with");
  });

  it("renders a natural built-with sentence for a single product", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "acme",
          products: [{ key: "workers", label: "Workers" }],
          readmeMarkdown: "# Edge Ping\n\nHealth checks from the edge.",
          readmePreviewMarkdown: "Health checks from the edge.",
          repo: "edge-ping",
          repoUrl: "https://github.com/acme/edge-ping",
          slug: "acme/edge-ping",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<p>Built with Workers.</p>");
  });

  it("property: falls back to a humanized owner and repo in story titles", () => {
    fc.assert(
      fc.property(
        fc.array(ownerWordArbitrary, { minLength: 1, maxLength: 3 }),
        fc.array(repoWordArbitrary, { minLength: 1, maxLength: 4 }),
        (ownerParts, repoParts) => {
          const owner = ownerParts.join("-");
          const repo = repoParts.join("-");
          const xml = renderRssFeed({
            items: [
              buildProject(1, "2026-04-23T12:00:00.000Z", {
                owner,
                readmeMarkdown: "A practical demo for the edge.",
                readmePreviewMarkdown: "A practical demo for the edge.",
                repo,
                repoUrl: `https://github.com/${owner}/${repo}`,
                slug: `${owner}/${repo}`,
              }),
            ],
            origin: "https://example.com",
          });

          expect(xml).toContain(
            `<title>${humanizeSlugForExpectation(owner)} started building ${humanizeSlugForExpectation(repo)}</title>`,
          );
        },
      ),
    );
  });

  it("property: drops a leading repo-name paragraph even when separators differ", () => {
    fc.assert(
      fc.property(
        fc.array(repoWordArbitrary, { minLength: 1, maxLength: 4 }),
        (parts) => {
          const repo = parts.join("-");
          const repoHeading = parts.join(" ").toUpperCase();
          const xml = renderRssFeed({
            items: [
              buildProject(1, "2026-04-23T12:00:00.000Z", {
                owner: "acme",
                readmePreviewMarkdown: `${repoHeading}\n\nMeaningful feed summary.`,
                repo,
                repoUrl: `https://github.com/acme/${repo}`,
                slug: `acme/${repo}`,
              }),
            ],
            origin: "https://example.com",
          });

          expect(xml).toContain("<p>Meaningful feed summary.</p>");
          expect(xml).not.toContain(`<p>${repoHeading}</p>`);
        },
      ),
    );
  });
});
