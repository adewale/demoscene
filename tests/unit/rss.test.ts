import fc from "fast-check";
import { describe, expect, it } from "vitest";

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

function buildProject(index: number, lastSeenAt: string): ProjectWithProducts {
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
});
