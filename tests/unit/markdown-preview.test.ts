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

  it("normalizes simple HTML hero blocks into readable preview text", () => {
    const preview = deriveMarkdownPreview(
      `<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent</em></p>
</div>

<p>Built on Cloudflare Workers.</p>`,
      { maxBlocks: 3, maxChars: 200 },
    );

    expect(preview).toBe(
      "Agentic Inbox\n\nA self-hosted email client with an AI agent\n\nBuilt on Cloudflare Workers.",
    );
    expect(preview).not.toMatch(/<\/?(div|h1|p|em)\b/i);
  });

  it("keeps the meaningful two-sentence web2kindle summary after removing decorative noise", () => {
    const preview = deriveMarkdownPreview(
      `# Web2Kindle 📚

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/megaconfidence/web2kindle.svg)](https://github.com/megaconfidence/web2kindle/stargazers)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/megaconfidence/web2kindle)

Transform any web article into a beautifully formatted Kindle ebook with just one click. Web2Kindle is a free and open-source Chrome extension that sends web content directly to your Kindle device for distraction-free reading.

<a href="https://chromewebstore.google.com/detail/web2kindle/kcafopmhdmijjdgckohoecjahhlhbbjk" target="_blank">
  <img src="/public/images/chrome.webp" style="height:50px;" />
</a>
<a href="https://addons.mozilla.org/en-US/firefox/addon/web2kindle/" target="_blank">
  <img src="/public/images/firefox.webp" style="height:50px;" />
</a>
</br>
</br>

## Features ✨

- Fast delivery to any Kindle device`,
    );

    expect(preview).toContain(
      "Transform any web article into a beautifully formatted Kindle ebook with just one click. Web2Kindle is a free and open-source Chrome extension that sends web content directly to your Kindle device for distraction-free reading.",
    );
    expect(preview).toContain("Features ✨");
    expect(preview).not.toContain("img.shields.io");
    expect(preview).not.toContain("deploy.workers.cloudflare.com/button");
    expect(preview).not.toContain("chromewebstore.google.com");
    expect(preview).not.toContain("addons.mozilla.org");
    expect(preview).not.toContain("<a");
    expect(preview).not.toContain("<img");
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

  it("property: badge and icon noise never displaces the first meaningful paragraph", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            "[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)",
            "[![GitHub stars](https://img.shields.io/github/stars/megaconfidence/web2kindle.svg)](https://github.com/megaconfidence/web2kindle/stargazers)",
            "[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/megaconfidence/web2kindle)",
            '<a href="https://chromewebstore.google.com/detail/web2kindle/demo" target="_blank"><img src="/public/images/chrome.webp" style="height:50px;" /></a>',
            '<a href="https://addons.mozilla.org/en-US/firefox/addon/web2kindle/" target="_blank"><img src="/public/images/firefox.webp" style="height:50px;" /></a>',
            "</br>",
            "<br />",
          ),
          { minLength: 1, maxLength: 12 },
        ),
        (noiseLines) => {
          const preview = deriveMarkdownPreview(
            `# Demo Scene\n\n${noiseLines.join("\n")}\n\nMeaningful preview copy.`,
            { maxBlocks: 4, maxChars: 220 },
          );

          expect(preview).toContain("Meaningful preview copy.");
          expect(preview).not.toContain("img.shields.io");
          expect(preview).not.toContain("deploy.workers.cloudflare.com/button");
          expect(preview).not.toContain("chromewebstore.google.com");
          expect(preview).not.toContain("addons.mozilla.org");
          expect(preview).not.toContain("<a");
          expect(preview).not.toContain("<img");
        },
      ),
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

  it("normalizes stored HTML preview content before trimming card copy", () => {
    const preview = formatMarkdownPreviewForCard(
      `<div align="center"><h1>Demo Scene</h1><p><em>Readable preview copy</em></p></div>

<p>Second paragraph.</p>

<p>Third paragraph.</p>`,
      "demo-scene",
    );

    expect(preview).toBe("Readable preview copy\n\nSecond paragraph.");
  });
});
