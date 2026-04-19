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
    render(
      <FeedPage
        page={1}
        pageSize={24}
        projects={[]}
        totalPages={1}
        totalProjects={0}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No Cloudflare repos yet" }),
    ).toBeInTheDocument();
  });

  it("renders cards when projects exist", () => {
    render(
      <FeedPage
        page={1}
        pageSize={24}
        projects={[project]}
        totalPages={1}
        totalProjects={1}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "demo-feed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Visit homepage" }),
    ).not.toBeInTheDocument();
  });

  it("renders pagination controls for multiple pages", () => {
    render(
      <FeedPage
        page={2}
        pageSize={24}
        projects={[project]}
        totalPages={4}
        totalProjects={73}
      />,
    );

    expect(
      screen.getAllByRole("navigation", { name: "Pagination" }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Newer" })[0]).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getAllByRole("link", { name: "Older" })[0]).toHaveAttribute(
      "href",
      "/?page=3",
    );
    expect(screen.getAllByText("Page 2 of 4")).toHaveLength(2);
  });
});
