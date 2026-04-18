import type { AppEnv, ProjectRecord, SyncSummary } from "./domain";
import { TEAM_MEMBERS, type TeamMember } from "./config/repositories";
import { createDb } from "./db/client";
import {
  deleteProjectBySlug,
  getProjectByOwnerRepo,
  listProjects,
  replaceProjectProducts,
  upsertProject,
} from "./db/queries";
import {
  discoverRepositoriesForTeamMember,
  fetchFirstAvailableRawFile,
  fetchRepositoryPage,
  README_FILE_NAMES,
  type FetchLike,
  WRANGLER_FILE_NAMES,
} from "./lib/github/fetch";
import { extractRepositoryPageMetadata } from "./lib/github/html";
import { deriveMarkdownPreview } from "./lib/markdown/preview";
import {
  inferCloudflareProducts,
  parseWranglerConfig,
} from "./lib/wrangler/parse";

import { parseRepositoryUrl } from "./lib/github/repositories";

type SyncOptions = {
  fetch?: FetchLike;
  now?: Date;
  repositories?: string[];
  teamMembers?: TeamMember[];
};

type SyncOutcome =
  | "added"
  | "ignored"
  | "removed"
  | "skipped_transiently"
  | "updated";

type DiscoveryResult = {
  accountsScanned: number;
  repositories: string[];
  reposDiscovered: number;
};

function getWranglerFormat(fileName: string): string {
  if (fileName.endsWith(".toml")) {
    return "toml";
  }

  if (fileName.endsWith(".jsonc")) {
    return "jsonc";
  }

  return "json";
}

function createEmptySummary(
  accountsScanned = 0,
  reposDiscovered = 0,
): SyncSummary {
  return {
    accountsScanned,
    reposAdded: 0,
    reposDiscovered,
    reposRemoved: 0,
    reposSkippedTransiently: 0,
    reposUpdated: 0,
  };
}

function applyOutcome(summary: SyncSummary, outcome: SyncOutcome): void {
  if (outcome === "added") {
    summary.reposAdded += 1;
    return;
  }

  if (outcome === "updated") {
    summary.reposUpdated += 1;
    return;
  }

  if (outcome === "removed") {
    summary.reposRemoved += 1;
    return;
  }

  if (outcome === "skipped_transiently") {
    summary.reposSkippedTransiently += 1;
  }
}

function normalizeDiscoveryResult(
  discovery: DiscoveryResult | string[],
): DiscoveryResult {
  if (Array.isArray(discovery)) {
    return {
      accountsScanned: 0,
      repositories: discovery,
      reposDiscovered: 0,
    };
  }

  return discovery;
}

export async function syncRepositories(
  env: AppEnv,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const fetchImpl = options.fetch ?? fetch;
  const now = (options.now ?? new Date()).toISOString();
  const db = createDb(env.DB);
  const discovery = normalizeDiscoveryResult(
    options.repositories
      ? [...new Set(options.repositories)]
      : await resolveTrackedRepositories(
          db,
          fetchImpl,
          options.teamMembers ?? TEAM_MEMBERS,
        ),
  );
  const summary = createEmptySummary(
    discovery.accountsScanned,
    discovery.reposDiscovered,
  );

  for (const repositoryUrl of discovery.repositories) {
    try {
      applyOutcome(
        summary,
        await syncRepository(db, fetchImpl, repositoryUrl, now),
      );
    } catch (error) {
      console.error(`Failed to sync repository ${repositoryUrl}`, error);
    }
  }

  return summary;
}

async function resolveTrackedRepositories(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  teamMembers: TeamMember[],
): Promise<DiscoveryResult> {
  const discoveredRepositories = new Set<string>();
  const repositoriesToProcess = new Set<string>();
  const teamLogins = new Set(teamMembers.map((teamMember) => teamMember.login));

  for (const teamMember of teamMembers) {
    try {
      const accountRepositories = await discoverRepositoriesForTeamMember(
        fetchImpl,
        teamMember,
      );

      for (const repositoryUrl of accountRepositories) {
        repositoriesToProcess.add(repositoryUrl);
        discoveredRepositories.add(repositoryUrl);
      }
    } catch (error) {
      console.error(
        `Failed to discover repositories for ${teamMember.login}`,
        error,
      );
    }
  }

  const existingProjects = await listProjects(db);

  for (const project of existingProjects) {
    if (teamLogins.has(project.owner)) {
      repositoriesToProcess.add(project.repoUrl);
    }
  }

  return {
    accountsScanned: teamMembers.length,
    repositories: [...repositoriesToProcess].sort(),
    reposDiscovered: discoveredRepositories.size,
  };
}

async function syncRepository(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  repositoryUrl: string,
  now: string,
): Promise<SyncOutcome> {
  const repository = parseRepositoryUrl(repositoryUrl);
  const existing = await getProjectByOwnerRepo(
    db,
    repository.owner,
    repository.repo,
  );
  const repoPage = await fetchRepositoryPage(fetchImpl, repository);

  if (repoPage.kind === "not_found") {
    if (!existing) {
      return "ignored";
    }

    await deleteProjectBySlug(db, repository.slug);
    return "removed";
  }

  if (repoPage.kind !== "found") {
    return "skipped_transiently";
  }

  const repoMetadata = extractRepositoryPageMetadata(repoPage.html);
  const wranglerFile = await fetchFirstAvailableRawFile(
    fetchImpl,
    repository,
    WRANGLER_FILE_NAMES,
  );

  if (wranglerFile.kind === "transient_error") {
    return "skipped_transiently";
  }

  if (wranglerFile.kind === "not_found") {
    if (!existing) {
      return "ignored";
    }

    await deleteProjectBySlug(db, repository.slug);
    return "removed";
  }

  const wranglerConfig = parseWranglerConfig(
    wranglerFile.file.contents,
    wranglerFile.file.fileName,
  );
  const products = inferCloudflareProducts(wranglerConfig);

  let readmeMarkdown = existing?.readmeMarkdown ?? "";
  let readmePreviewMarkdown = existing?.readmePreviewMarkdown ?? "";

  if (!existing) {
    const readmeFile = await fetchFirstAvailableRawFile(
      fetchImpl,
      repository,
      README_FILE_NAMES,
    );

    if (readmeFile.kind === "transient_error") {
      return "skipped_transiently";
    }

    if (readmeFile.kind === "found") {
      readmeMarkdown = readmeFile.file.contents;
      readmePreviewMarkdown = deriveMarkdownPreview(readmeMarkdown);
    }
  }

  const project: ProjectRecord = {
    slug: repository.slug,
    owner: repository.owner,
    repo: repository.repo,
    repoUrl: repository.url,
    homepageUrl: repoMetadata.homepageUrl,
    branch: wranglerFile.file.branch,
    wranglerPath: wranglerFile.file.fileName,
    wranglerFormat: getWranglerFormat(wranglerFile.file.fileName),
    readmeMarkdown,
    readmePreviewMarkdown,
    previewImageUrl: repoMetadata.previewImageUrl,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  };

  await upsertProject(db, project);
  await replaceProjectProducts(db, project.slug, products);

  return existing ? "updated" : "added";
}
