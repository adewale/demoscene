import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProjectWithProducts } from "../../src/domain";
import { ProjectCard } from "../../src/components/ProjectCard";
import { ProjectDetailPage } from "../../src/components/ProjectDetailPage";

const project: ProjectWithProducts = {
  slug: "acme/demo-scene",
  owner: "acme",
  repo: "demo-scene",
  repoUrl: "https://github.com/acme/demo-scene",
  repoCreationOrder: 42,
  homepageUrl: "https://demo.example.com",
  branch: "main",
  wranglerPath: "wrangler.toml",
  wranglerFormat: "toml",
  readmeMarkdown:
    "# Demo Scene\n\nWelcome to the **demo** project.\n\n<script>alert('xss')</script>",
  readmePreviewMarkdown: "# Demo Scene\n\nWelcome to the **demo** project.",
  previewImageUrl: "https://images.example.com/demo.png",
  firstSeenAt: "2026-04-14T12:00:00.000Z",
  lastSeenAt: "2026-04-14T12:00:00.000Z",
  products: [
    { key: "workers", label: "Workers" },
    { key: "d1", label: "D1" },
  ],
};

describe("ProjectCard", () => {
  it("renders a scannable project card with links and product pills", () => {
    render(<ProjectCard project={project} />);

    expect(
      screen.getByRole("heading", { name: "demo-scene" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "acme avatar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Workers").querySelector("svg"),
    ).not.toBeNull();
    expect(screen.getByLabelText("D1").querySelector("svg")).not.toBeNull();
    expect(
      screen.getByRole("img", { name: "demo-scene preview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open feed item" }),
    ).toHaveAttribute("href", "/projects/acme/demo-scene");
    expect(
      screen.getByRole("link", { name: "Visit homepage" }),
    ).toHaveAttribute("href", "https://demo.example.com");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/demo-scene",
    );
  });

  it("omits optional media and homepage actions when unavailable", () => {
    const { container } = render(
      <ProjectCard
        project={{
          ...project,
          homepageUrl: null,
          previewImageUrl: null,
        }}
      />,
    );

    expect(
      within(container).getByText("Preview unavailable"),
    ).toBeInTheDocument();
    expect(
      within(container).queryByRole("link", { name: "Visit homepage" }),
    ).not.toBeInTheDocument();
  });
});

describe("ProjectDetailPage", () => {
  it("renders sanitized full README markdown", () => {
    const { container } = render(<ProjectDetailPage project={project} />);

    expect(
      screen.getByRole("heading", { name: "acme/demo-scene" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".markdown-document")).toHaveTextContent(
      "Welcome to the demo project.",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(
      within(container).getByRole("link", { name: "Visit homepage" }),
    ).toHaveAttribute("href", "https://demo.example.com");
  });

  it("keeps the GitHub repo action when no homepage exists", () => {
    const { container } = render(
      <ProjectDetailPage
        project={{
          ...project,
          homepageUrl: null,
          previewImageUrl: null,
        }}
      />,
    );

    expect(
      within(container).queryByRole("link", { name: "Visit homepage" }),
    ).not.toBeInTheDocument();
    expect(
      within(container).getByText("Preview unavailable"),
    ).toBeInTheDocument();
    expect(
      within(container).getByRole("link", { name: "Open GitHub repo" }),
    ).toHaveAttribute("href", "https://github.com/acme/demo-scene");
  });
});
