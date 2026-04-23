import { describe, expect, it } from "vitest";

import { extractProjectPresence } from "../../src/lib/project-presence";

describe("extractProjectPresence", () => {
  it("prefers real live/demo/deploy presence over generic docs links", () => {
    expect(
      extractProjectPresence({
        homepageUrl: "https://docs.github.com",
        readmeMarkdown: `
[Live site](https://demo.example.com)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acme/demo)
[Watch demo](https://www.loom.com/share/123)
`,
        repoUrl: "https://github.com/acme/demo",
      }),
    ).toEqual([
      { href: "https://demo.example.com", kind: "live", label: "Live" },
      { href: "https://github.com/acme/demo", kind: "github", label: "GitHub" },
    ]);
  });

  it("falls back to GitHub only when there is no live project presence", () => {
    expect(
      extractProjectPresence({
        homepageUrl: "https://docs.github.com",
        readmeMarkdown: "# Demo",
        repoUrl: "https://github.com/acme/demo",
      }),
    ).toEqual([
      { href: "https://github.com/acme/demo", kind: "github", label: "GitHub" },
    ]);
  });

  it("ignores bare inline video URLs for project presence", () => {
    expect(
      extractProjectPresence({
        homepageUrl: null,
        readmeMarkdown: "Demo clip: https://www.loom.com/share/inline-video",
        repoUrl: "https://github.com/acme/demo",
      }),
    ).toEqual([
      { href: "https://github.com/acme/demo", kind: "github", label: "GitHub" },
    ]);
  });
});
