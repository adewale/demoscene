import { Hono, type Context } from "hono";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { AppEnv } from "./domain";
import { TEAM_MEMBERS } from "./config/repositories";
import { createDb } from "./db/client";
import {
  countProjects,
  finalizeSyncRunFromJobs,
  getLatestSyncRunJobByStatus,
  getLatestFailedSyncRun,
  getLatestRateLimitedSyncRun,
  getLatestSyncRun,
  getProjectByOwnerRepo,
  getSyncRunJob,
  listSyncRunJobCounts,
  listProjectsPage,
  reactivateSyncRunJobForReplay,
} from "./db/queries";
import { parseQueueMessage } from "./lib/queue/messages";
import { renderRssFeed } from "./lib/rss";
import { FEED_PAGE_SIZE, RSS_ITEM_LIMIT } from "./lib/sync-policy";
import { runScheduledSync } from "./scheduled";

import { AppShell } from "./components/AppShell";
import { DesignPage } from "./components/DesignPage";
import { FeedPage } from "./components/FeedPage";
import type { TeamMemberOverview } from "./components/TeamMemberDirectory";
import { syncRepositories } from "./sync";

type ProjectPathParts = {
  owner: string;
  repo: string;
};

const HOME_PAGE_SIZE = FEED_PAGE_SIZE;

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

function sortTeamMembersAlphabetically(members: typeof TEAM_MEMBERS) {
  return [...members].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function loadTeamMemberOverview(): TeamMemberOverview[] {
  return sortTeamMembersAlphabetically(TEAM_MEMBERS);
}

async function loadSyncRunForRequest(
  c: Context<{ Bindings: AppEnv }>,
  kind: "failed" | "latest" | "rate_limited",
) {
  const db = createDb(c.env.DB);

  if (kind === "failed") {
    return getLatestFailedSyncRun(db);
  }

  if (kind === "rate_limited") {
    return getLatestRateLimitedSyncRun(db);
  }

  return getLatestSyncRun(db);
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

function getQueueForJob(c: Context<{ Bindings: AppEnv }>, kind: string) {
  if (kind === "scan-owner") {
    return c.env.OWNER_QUEUE ?? null;
  }

  if (kind === "sync-repo" || kind === "verify-missing-repo") {
    return c.env.REPO_QUEUE ?? null;
  }

  return null;
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
    const teamMembers = loadTeamMemberOverview();

    return c.html(
      renderHtml(
        <AppShell title="demoscene" tagline="Watch us build.">
          <FeedPage
            page={page}
            projects={projects}
            teamMembers={teamMembers}
            totalPages={totalPages}
          />
        </AppShell>,
      ),
    );
  });

  app.get("/design", async (c) => {
    const db = createDb(c.env.DB);
    const projects = await listProjectsPage(db, 6, 0);

    return c.html(
      renderHtml(
        <AppShell
          title="demoscene"
          subtitle="Design language assembled from the same chips, cards, copy, and feed primitives as the live app."
        >
          <DesignPage
            featuredProject={projects[0] ?? null}
            projects={projects}
          />
        </AppShell>,
      ),
    );
  });

  app.get("/feed.json", async (c) => {
    const db = createDb(c.env.DB);
    const url = new URL(c.req.url);
    const totalItems = await countProjects(db);
    const totalPages = Math.max(1, Math.ceil(totalItems / FEED_PAGE_SIZE));
    const page = Math.min(
      parsePositivePage(url.searchParams.get("page")),
      totalPages,
    );
    const items = await listProjectsPage(
      db,
      FEED_PAGE_SIZE,
      (page - 1) * FEED_PAGE_SIZE,
    );
    return c.json({ items, page, totalItems, totalPages });
  });

  app.get("/rss.xml", async (c) => {
    const db = createDb(c.env.DB);
    const items = await listProjectsPage(db, RSS_ITEM_LIMIT, 0);
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
    const scheduledRunRequested = searchParams.get("scheduled") === "true";
    const requestedRepos = searchParams.getAll("repo");
    const requestedMembers = searchParams.getAll("member");
    const teamMembers =
      requestedMembers.length > 0
        ? TEAM_MEMBERS.filter((member) =>
            requestedMembers.includes(member.login),
          )
        : undefined;

    if (scheduledRunRequested) {
      c.executionCtx.waitUntil(
        runScheduledSync({
          cron: searchParams.get("cron") ?? "0 12 * * *",
          env: c.env,
        }),
      );

      return c.json(
        { accepted: true, cron: searchParams.get("cron") ?? "0 12 * * *" },
        202,
      );
    }

    return c.json(
      await syncRepositories(c.env, {
        repositories: requestedRepos.length > 0 ? requestedRepos : undefined,
        teamMembers,
      }),
    );
  });

  app.get("/debug/sync-runs/latest", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const syncRun = await loadSyncRunForRequest(c, "latest");

    if (!syncRun) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(syncRun);
  });

  app.get("/debug/sync-runs/latest-failed", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const syncRun = await loadSyncRunForRequest(c, "failed");

    if (!syncRun) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(syncRun);
  });

  app.get("/debug/sync-runs/latest-rate-limited", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const syncRun = await loadSyncRunForRequest(c, "rate_limited");

    if (!syncRun) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(syncRun);
  });

  app.get("/debug/queue/jobs/latest-failed", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const job = await getLatestSyncRunJobByStatus(createDb(c.env.DB), "failed");

    if (!job) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(job);
  });

  app.get("/debug/queue/jobs/latest-deferred", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const job = await getLatestSyncRunJobByStatus(
      createDb(c.env.DB),
      "deferred",
    );

    if (!job) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json(job);
  });

  app.get("/debug/queue/sync-runs/:runId/job-counts", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const runId = c.req.param("runId");

    return c.json({
      counts: await listSyncRunJobCounts(createDb(c.env.DB), runId),
      runId,
    });
  });

  app.post("/debug/queue/sync-runs/:runId/finalize", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const runId = c.req.param("runId");
    const result = await finalizeSyncRunFromJobs(createDb(c.env.DB), {
      finishedAt: new Date().toISOString(),
      runId,
    });

    return c.json({ runId, ...result });
  });

  app.post("/debug/queue/dlq/:jobId/replay", async (c) => {
    if (!areDebugRoutesEnabled(c)) {
      return c.notFound();
    }

    const db = createDb(c.env.DB);
    const jobId = c.req.param("jobId");
    const job = await getSyncRunJob(db, jobId);

    if (!job) {
      return c.json({ error: "Not found" }, 404);
    }

    const queue = getQueueForJob(c, job.kind);

    if (!queue) {
      return c.json(
        { error: `No queue binding for job kind ${job.kind}` },
        503,
      );
    }

    const message = parseQueueMessage(JSON.parse(job.payloadJson) as unknown);

    await reactivateSyncRunJobForReplay(db, {
      id: job.id,
      replayedAt: new Date().toISOString(),
    });
    await queue.send(message);

    return c.json({ accepted: true, jobId }, 202);
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
