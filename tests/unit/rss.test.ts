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

  it("omits duplicate repo headings and preview images from RSS bodies", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          owner: "acme",
          previewImageUrl: "https://images.example.com/preview.png",
          readmePreviewMarkdown:
            "Agentic Inbox\n\nA clearer summary for feed readers.",
          repo: "agentic-inbox",
          repoUrl: "https://github.com/acme/agentic-inbox",
          slug: "acme/agentic-inbox",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<title>acme/agentic-inbox</title>");
    expect(xml).toContain("<p>A clearer summary for feed readers.</p>");
    expect(xml).not.toContain("<p>Agentic Inbox</p>");
    expect(xml).not.toContain("<p><strong>acme/agentic-inbox</strong></p>");
    expect(xml).not.toContain("<img src=");
  });

  it("renders Cloudflare categories and live links when they add reader value", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          homepageUrl: "https://demo.example.com",
          products: [
            { key: "workers", label: "Workers" },
            { key: "d1", label: "D1" },
          ],
          readmeMarkdown: "[Live site](https://demo.example.com)",
          readmePreviewMarkdown: "Useful preview copy.",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<p><strong>Cloudflare:</strong> Workers, D1</p>");
    expect(xml).toContain("<category>Workers</category>");
    expect(xml).toContain("<category>D1</category>");
    expect(xml).toContain('<a href="https://demo.example.com">Live</a>');
  });

  it("drops low-signal heading-only paragraphs from RSS bodies", () => {
    const xml = renderRssFeed({
      items: [
        buildProject(1, "2026-04-23T12:00:00.000Z", {
          readmePreviewMarkdown:
            "How it works\n\nA sharper summary for feed readers.\n\nStack\n\nWorkers, D1, and Queues.",
        }),
      ],
      origin: "https://example.com",
    });

    expect(xml).toContain("<p>A sharper summary for feed readers.</p>");
    expect(xml).toContain("<p>Workers, D1, and Queues.</p>");
    expect(xml).not.toContain("<p>How it works</p>");
    expect(xml).not.toContain("<p>Stack</p>");
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
