import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProjectWithProducts } from "../../src/domain";
import { FeedPage } from "../../src/components/FeedPage";

const project: ProjectWithProducts = {
  slug: "acme/demo-feed",
  owner: "acme",
  repo: "demo-feed",
  repoUrl: "https://github.com/acme/demo-feed",
  repoCreationOrder: 10,
  repoCreatedAt: "2026-04-14T12:00:00.000Z",
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
    render(<FeedPage page={1} projects={[]} totalPages={1} />);

    expect(
      screen.getByRole("heading", { name: "No Cloudflare repos yet" }),
    ).toBeInTheDocument();
  });

  it("renders cards when projects exist", () => {
    render(<FeedPage page={1} projects={[project]} totalPages={1} />);

    expect(
      screen.getByRole("heading", { name: "demo-feed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Live" }),
    ).not.toBeInTheDocument();
  });

  it("renders pagination controls for multiple pages", () => {
    render(<FeedPage page={2} projects={[project]} totalPages={4} />);

    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Newer" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Older" })).toHaveAttribute(
      "href",
      "/?page=3",
    );
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
  });

  it("inserts a day marker when a new created day starts in the feed", () => {
    render(
      <FeedPage
        page={1}
        projects={[
          project,
          {
            ...project,
            slug: "acme/demo-feed-next-day",
            repo: "demo-feed-next-day",
            repoUrl: "https://github.com/acme/demo-feed-next-day",
            repoCreatedAt: "2026-04-15T12:00:00.000Z",
          },
        ]}
        totalPages={1}
      />,
    );

    expect(screen.getAllByText(/15 Apr/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14 Apr/).length).toBeGreaterThan(0);
  });
});
