import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "../../src/components/AppShell";
import type { ProjectWithProducts } from "../../src/domain";
import { ProjectCard } from "../../src/components/ProjectCard";

const project: ProjectWithProducts = {
  slug: "acme/demo-scene",
  owner: "acme",
  repo: "demo-scene",
  repoUrl: "https://github.com/acme/demo-scene",
  repoCreationOrder: 42,
  repoCreatedAt: "2026-04-14T12:00:00.000Z",
  homepageUrl: "https://demo.example.com",
  branch: "main",
  wranglerPath: "wrangler.toml",
  wranglerFormat: "toml",
  readmeMarkdown:
    "# Demo Scene\n\nWelcome to the **demo** project.\n\n[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acme/demo-scene)\n\n[Watch demo](https://www.loom.com/share/demo-scene)\n\n<script>alert('xss')</script>",
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
  it("uses square card corners and visible overflow for attached tooltips", () => {
    const markup = renderToStaticMarkup(
      <AppShell title="demoscene">
        <ProjectCard project={project} />
      </AppShell>,
    );

    expect(markup).toContain("overflow: visible;");
    expect(markup).toContain("border-radius: 0;");
    expect(markup).toContain("card-corner card-corner-tl");
    expect(markup).toContain("card-corner card-corner-br");
  });

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
    expect(screen.getByRole("link", { name: "Workers" })).toHaveAttribute(
      "href",
      "https://developers.cloudflare.com/workers/",
    );
    expect(
      screen.getByText("Workers", { selector: ".product-chip-label" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("D1", { selector: ".product-chip-label" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workers" })).not.toHaveAttribute(
      "title",
    );
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);
    expect(
      screen.queryByRole("img", { name: "demo-scene preview" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "demo-scene" })).toHaveAttribute(
      "href",
      "https://github.com/acme/demo-scene",
    );
    expect(screen.queryByText("acme/demo-scene")).not.toBeInTheDocument();
    expect(screen.queryByText("14 Apr 2026")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Live" }),
    ).not.toBeInTheDocument();
  });

  it("renders icons and docs links for Sandboxes and Agents pills", () => {
    render(
      <ProjectCard
        project={{
          ...project,
          products: [
            { key: "sandboxes", label: "Sandboxes" },
            { key: "agents", label: "Agents" },
          ],
        }}
      />,
    );

    expect(
      screen.getByLabelText("Sandboxes").querySelector("svg"),
    ).not.toBeNull();
    expect(screen.getByLabelText("Agents").querySelector("svg")).not.toBeNull();
    expect(
      screen.getByText("Sandbox", { selector: ".product-chip-label" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Agents", { selector: ".product-chip-label" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sandboxes" })).toHaveAttribute(
      "href",
      "https://developers.cloudflare.com/sandbox/",
    );
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute(
      "href",
      "https://developers.cloudflare.com/agents/",
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

    expect(within(container).queryByText("Preview unavailable")).toBeNull();
    expect(
      within(container).queryByRole("link", { name: "Live" }),
    ).not.toBeInTheDocument();
  });
});
