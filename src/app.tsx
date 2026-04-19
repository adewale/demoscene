import { Hono, type Context } from "hono";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { AppEnv } from "./domain";
import { TEAM_MEMBERS } from "./config/repositories";
import { createDb } from "./db/client";
import {
  countProjects,
  getProjectByOwnerRepo,
  listProjects,
  listProjectsPage,
} from "./db/queries";
import { projectPath } from "./lib/paths";

import { AppShell } from "./components/AppShell";
import { FeedPage } from "./components/FeedPage";
import { ProjectDetailPage } from "./components/ProjectDetailPage";
import { syncRepositories } from "./sync";

type ProjectPathParts = {
  owner: string;
  repo: string;
};

const HOME_PAGE_SIZE = 24;

function renderHtml(markup: ReactNode): string {
  return `<!DOCTYPE html>${renderToString(markup)}`;
}

function decodeProjectSegment(segment: string | undefined): string | null {
  return segment ? decodeURIComponent(segment) : null;
}

function areDebugRoutesEnabled(url: string, env: AppEnv): boolean {
  const hostname = new URL(url).hostname;
  return (
    env.ENABLE_DEBUG_ROUTES === "true" ||
    hostname === "127.0.0.1" ||
    hostname === "localhost"
  );
}

function extractProjectPathParts(url: string): ProjectPathParts | null {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const owner = decodeProjectSegment(segments[1]);
  const repo = decodeProjectSegment(segments[2]);

  return owner && repo ? { owner, repo } : null;
}

function extractProjectJsonPathParts(url: string): ProjectPathParts | null {
  const parts = extractProjectPathParts(url);

  if (!parts || !parts.repo.endsWith(".json")) {
    return null;
  }

  return {
    owner: parts.owner,
    repo: parts.repo.slice(0, -".json".length),
  };
}

function parsePositivePage(value: string | null): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function loadProjectFromRequest(
  c: Context<{ Bindings: AppEnv }>,
  pathParts: ProjectPathParts | null,
) {
  const db = createDb(c.env.DB);
  const owner = pathParts?.owner;
  const repo = pathParts?.repo;

  if (!owner || !repo) {
    return null;
  }

  return getProjectByOwnerRepo(db, owner, repo);
}

export function createApp() {
  const app = new Hono<{ Bindings: AppEnv }>();

  app.get("/", async (c) => {
    const db = createDb(c.env.DB);
    const url = new URL(c.req.url);
    const totalProjects = await countProjects(db);
    const totalPages = Math.max(1, Math.ceil(totalProjects / HOME_PAGE_SIZE));
    const page = Math.min(
      parsePositivePage(url.searchParams.get("page")),
      totalPages,
    );
    const projects = await listProjectsPage(
      db,
      HOME_PAGE_SIZE,
      (page - 1) * HOME_PAGE_SIZE,
    );

    return c.html(
      renderHtml(
        <AppShell title="demoscene">
          <FeedPage page={page} projects={projects} totalPages={totalPages} />
        </AppShell>,
      ),
    );
  });

  app.get("/feed.json", async (c) => {
    const db = createDb(c.env.DB);
    const items = await listProjects(db);
    return c.json({ items });
  });

  app.get("/debug/sync", async (c) => {
    if (!areDebugRoutesEnabled(c.req.url, c.env)) {
      return c.notFound();
    }

    const searchParams = new URL(c.req.url).searchParams;
    const requestedRepos = searchParams.getAll("repo");
    const requestedMembers = searchParams.getAll("member");
    const teamMembers =
      requestedMembers.length > 0
        ? TEAM_MEMBERS.filter((member) =>
            requestedMembers.includes(member.login),
          )
        : undefined;

    return c.json(
      await syncRepositories(c.env, {
        repositories: requestedRepos.length > 0 ? requestedRepos : undefined,
        teamMembers,
      }),
    );
  });

  app.get("/projects/*", async (c) => {
    const isJsonRequest = new URL(c.req.url).pathname.endsWith(".json");
    const project = await loadProjectFromRequest(
      c,
      isJsonRequest
        ? extractProjectJsonPathParts(c.req.url)
        : extractProjectPathParts(c.req.url),
    );

    if (!project) {
      if (isJsonRequest) {
        return c.json({ error: "Not found" }, 404);
      }

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

    if (isJsonRequest) {
      return c.json(project);
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
