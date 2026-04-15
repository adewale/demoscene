import { Hono, type Context } from "hono";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { AppEnv } from "./domain";
import { createDb } from "./db/client";
import { getProjectByOwnerRepo, listProjects } from "./db/queries";
import { projectPath } from "./lib/paths";

import { AppShell } from "./components/AppShell";
import { FeedPage } from "./components/FeedPage";
import { ProjectDetailPage } from "./components/ProjectDetailPage";

function renderHtml(markup: ReactNode): string {
  return `<!DOCTYPE html>${renderToString(markup)}`;
}

function extractProjectPathParts(url: string) {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const owner = segments[1] ?? null;
  const rawRepo = segments[2] ?? null;

  return {
    owner,
    repo: rawRepo?.replace(/\.json$/, "") ?? null,
  };
}

async function loadProjectFromRequest(c: Context<{ Bindings: AppEnv }>) {
  const db = createDb(c.env.DB);
  const { owner, repo } = extractProjectPathParts(c.req.url);

  if (!owner || !repo) {
    return null;
  }

  return getProjectByOwnerRepo(db, owner, repo);
}

export function createApp() {
  const app = new Hono<{ Bindings: AppEnv }>();

  app.get("/", async (c) => {
    const db = createDb(c.env.DB);
    const projects = await listProjects(db);

    return c.html(
      renderHtml(
        <AppShell
          subtitle="Daily snapshots of public team repos using Cloudflare, rendered as a scannable card feed."
          title="demoscene"
        >
          <FeedPage projects={projects} />
        </AppShell>,
      ),
    );
  });

  app.get("/feed.json", async (c) => {
    const db = createDb(c.env.DB);
    const items = await listProjects(db);
    return c.json({ items });
  });

  app.get("/projects/:owner/:repo{.+\\.json}", async (c) => {
    const item = await loadProjectFromRequest(c);

    if (!item) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(item);
  });

  app.get("/projects/:owner/:repo", async (c) => {
    const project = await loadProjectFromRequest(c);

    if (!project) {
      return c.html(
        renderHtml(
          <AppShell
            subtitle="The requested project is not in the current feed."
            title="Project not found"
          >
            <section className="empty-state">
              <h2>Project not found</h2>
              <p>That repo is not currently available in the demoscene feed.</p>
            </section>
          </AppShell>,
        ),
        404,
      );
    }

    return c.html(
      renderHtml(
        <AppShell
          subtitle="Full project README and Cloudflare product metadata."
          title={`${project.owner}/${project.repo}`}
        >
          <ProjectDetailPage project={project} />
        </AppShell>,
      ),
    );
  });

  app.get("/robots.txt", (c) => {
    return c.text(
      ["User-agent: *", "Allow: /", "Sitemap: /sitemap.xml"].join("\n"),
    );
  });

  app.get("/sitemap.xml", async (c) => {
    const db = createDb(c.env.DB);
    const projects = await listProjects(db);
    const urls = [
      "/",
      ...projects.map((project) => projectPath(project.owner, project.repo)),
    ];
    const origin = new URL(c.req.url).origin;
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((path) => `<url><loc>${origin}${path}</loc></url>`)
      .join("")}</urlset>`;

    return c.body(body, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
      },
    });
  });

  return app;
}
