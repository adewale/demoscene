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
import { renderRssFeed } from "./lib/rss";

import { AppShell } from "./components/AppShell";
import { FeedPage } from "./components/FeedPage";
import { syncRepositories } from "./sync";

type ProjectPathParts = {
  owner: string;
  repo: string;
};

const HOME_PAGE_SIZE = 24;

function renderHtml(markup: ReactNode): string {
  return `<!DOCTYPE html>${renderToString(markup)}`;
}

function isLocalDebugRequest(url: string): boolean {
  const hostname = new URL(url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function hasValidDebugSyncToken(c: Context<{ Bindings: AppEnv }>): boolean {
  const expectedToken = c.env.DEBUG_SYNC_TOKEN;
  const providedToken = c.req.header("x-debug-sync-token");

  return Boolean(expectedToken) && providedToken === expectedToken;
}

function areDebugRoutesEnabled(c: Context<{ Bindings: AppEnv }>): boolean {
  if (isLocalDebugRequest(c.req.url)) {
    return true;
  }

  return c.env.ENABLE_DEBUG_ROUTES === "true" && hasValidDebugSyncToken(c);
}

function extractProjectJsonPathParts(url: string): ProjectPathParts | null {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const owner = segments[1] ? decodeURIComponent(segments[1]) : null;
  const repoWithSuffix = segments[2] ? decodeURIComponent(segments[2]) : null;

  if (!owner || !repoWithSuffix || !repoWithSuffix.endsWith(".json")) {
    return null;
  }

  return {
    owner,
    repo: repoWithSuffix.slice(0, -".json".length),
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

  app.get("/rss.xml", async (c) => {
    const db = createDb(c.env.DB);
    const items = await listProjects(db);
    const origin = new URL(c.req.url).origin;

    return c.body(renderRssFeed({ items, origin }), {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
      },
    });
  });

  app.get("/debug/sync", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
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
    const pathParts = extractProjectJsonPathParts(c.req.url);

    if (!pathParts) {
      return c.notFound();
    }

    const project = await loadProjectFromRequest(c, pathParts);

    if (!project) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(project);
  });

  app.get("/robots.txt", (c) => {
    return c.text(
      ["User-agent: *", "Allow: /", "Sitemap: /sitemap.xml"].join("\n"),
    );
  });

  app.get("/sitemap.xml", (c) => {
    const urls = ["/", "/rss.xml"];
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
