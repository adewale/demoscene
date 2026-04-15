import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProjectWithProducts } from "../../src/domain";
import { FeedPage } from "../../src/components/FeedPage";

const project: ProjectWithProducts = {
  slug: "acme/demo-feed",
  owner: "acme",
  repo: "demo-feed",
  repoUrl: "https://github.com/acme/demo-feed",
  homepageUrl: null,
  branch: "main",
  wranglerPath: "wrangler.toml",
  wranglerFormat: "toml",
  readmeMarkdown: "# Demo Feed",
  readmePreviewMarkdown: "# Demo Feed",
  previewImageUrl: null,
  firstSeenAt: "2026-04-14T12:00:00.000Z",
  lastSeenAt: "2026-04-14T12:00:00.000Z",
  products: [{ key: "workers", label: "Workers" }],
};

describe("FeedPage", () => {
  it("renders an empty state when no projects exist", () => {
    render(<FeedPage projects={[]} />);

    expect(
      screen.getByRole("heading", { name: "No Cloudflare repos yet" }),
    ).toBeInTheDocument();
  });

  it("renders cards when projects exist", () => {
    render(<FeedPage projects={[project]} />);

    expect(
      screen.getByRole("heading", { name: "demo-feed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Visit homepage" }),
    ).not.toBeInTheDocument();
  });
});
