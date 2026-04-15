import { describe, expect, it } from "vitest";

import { extractRepositoryPageMetadata } from "../../src/lib/github/html";

describe("extractRepositoryPageMetadata", () => {
  it("extracts homepage and preview image from repository HTML", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://opengraph.githubassets.com/example/image.png" />
        </head>
        <body>
          <a data-testid="repository-homepage-url" href="https://demo.example.com">demo.example.com</a>
        </body>
      </html>
    `;

    expect(extractRepositoryPageMetadata(html)).toEqual({
      homepageUrl: "https://demo.example.com",
      previewImageUrl: "https://opengraph.githubassets.com/example/image.png",
    });
  });

  it("returns null metadata when the repo page has no extras", () => {
    expect(
      extractRepositoryPageMetadata("<html><body><h1>Repo</h1></body></html>"),
    ).toEqual({
      homepageUrl: null,
      previewImageUrl: null,
    });
  });

  it("decodes HTML entities in extracted URLs", () => {
    const html =
      '<a data-testid="repository-homepage-url" href="https://demo.example.com?foo=1&amp;bar=2">demo</a>';

    expect(extractRepositoryPageMetadata(html).homepageUrl).toBe(
      "https://demo.example.com?foo=1&bar=2",
    );
  });
});
