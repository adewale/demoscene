import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "../../src/components/AppShell";

describe("AppShell", () => {
  it("renders the optional homepage tagline and subtitle when provided", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        title="demoscene"
        tagline="Watch us build."
        subtitle="Design language assembled from live feed primitives."
      >
        <div>content</div>
      </AppShell>,
    );

    expect(markup).toContain('<p class="site-tagline">Watch us build.</p>');
    expect(markup).toContain(
      "<p>Design language assembled from live feed primitives.</p>",
    );
  });

  it("omits the optional tagline and subtitle when absent", () => {
    const markup = renderToStaticMarkup(
      <AppShell title="demoscene">
        <div>content</div>
      </AppShell>,
    );

    expect(markup).not.toContain('<p class="site-tagline">');
    expect(markup).not.toContain(
      "Design language assembled from live feed primitives.",
    );
  });
});
