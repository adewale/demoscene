import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { deriveMarkdownPreview } from "../../src/lib/markdown/preview";

describe("deriveMarkdownPreview", () => {
  it("keeps the first meaningful Markdown blocks", () => {
    const preview = deriveMarkdownPreview(
      `# Demo Scene

![badge](https://example.com/badge.svg)

This is the first real paragraph.

This is the second real paragraph.

This is the third real paragraph.
`,
      { maxBlocks: 2, maxChars: 140 },
    );

    expect(preview).toContain("# Demo Scene");
    expect(preview).toContain("This is the first real paragraph.");
    expect(preview).not.toContain("badge.svg");
    expect(preview).not.toContain("third real paragraph");
  });

  it("always respects the maximum character budget", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const preview = deriveMarkdownPreview(value, {
          maxBlocks: 2,
          maxChars: 80,
        });
        expect(preview.length).toBeLessThanOrEqual(80);
      }),
    );
  });

  it("returns an empty string for blank markdown", () => {
    expect(deriveMarkdownPreview("   \n\n ")).toBe("");
  });

  it("falls back to clamped source content when only image blocks exist", () => {
    const preview = deriveMarkdownPreview(
      "![badge](https://example.com/badge.svg)",
      {
        maxBlocks: 1,
        maxChars: 18,
      },
    );

    expect(preview).toHaveLength(18);
    expect(preview.startsWith("![badge](https://")).toBe(true);
  });
});
