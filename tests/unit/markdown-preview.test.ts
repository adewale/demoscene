import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  deriveMarkdownPreview,
  formatMarkdownPreviewForCard,
} from "../../src/lib/markdown/preview";

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

    expect(preview).toContain("Demo Scene");
    expect(preview).not.toContain("# Demo Scene");
    expect(preview).toContain("This is the first real paragraph.");
    expect(preview).not.toContain("badge.svg");
    expect(preview).not.toContain("third real paragraph");
  });

  it("normalizes heading syntax into body text", () => {
    const preview = deriveMarkdownPreview(
      `Heading One
===========

## Heading Two

### Heading Three`,
      { maxBlocks: 3, maxChars: 140 },
    );

    expect(preview).toBe("Heading One\n\nHeading Two\n\nHeading Three");
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

  it("never leaves markdown heading markers at the start of a line", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const preview = deriveMarkdownPreview(`# ${value}\n\n## ${value}`, {
          maxBlocks: 2,
          maxChars: 120,
        });

        expect(preview).not.toMatch(/^#+\s/m);
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

describe("formatMarkdownPreviewForCard", () => {
  it("removes a matching repository heading, deploy badge noise, and extra paragraphs", () => {
    const preview = formatMarkdownPreviewForCard(
      `# Demo Scene

Welcome to the **demo** project.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acme/demo-scene)

This is the second paragraph.

This is the third paragraph.`,
      "demo-scene",
    );

    expect(preview).toBe(
      "Welcome to the **demo** project.\n\nThis is the second paragraph.",
    );
  });
});
