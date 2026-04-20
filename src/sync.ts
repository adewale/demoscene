import type { AppEnv, ProjectRecord, SyncSummary } from "./domain";
import { TEAM_MEMBERS, type TeamMember } from "./config/repositories";
import { createDb } from "./db/client";
import {
  deleteProjectsByOwnersNotIn,
  deleteProjectBySlug,
  getProjectByOwnerRepo,
  listProjectSyncStateByOwners,
  replaceProjectProducts,
  upsertProject,
} from "./db/queries";
import {
  discoverRepositoriesForTeamMember,
  fetchRepositoryMetadata,
  fetchFirstAvailableRawFile,
  fetchRepositoryPage,
  type GitHubRepositoryMetadata,
  README_FILE_NAMES,
  type FetchLike,
  validatePreviewImageUrl,
  WRANGLER_FILE_NAMES,
} from "./lib/github/fetch";
import { extractRepositoryPageMetadata } from "./lib/github/html";
import { deriveMarkdownPreview } from "./lib/markdown/preview";
import {
  inferCloudflareProducts,
  parseWranglerConfig,
} from "./lib/wrangler/parse";

import {
  parseRepositoryUrl,
  type ParsedRepositoryUrl,
} from "./lib/github/repositories";

type SyncOptions = {
  fetch?: FetchLike;
  now?: Date;
  pruneUntrackedOwners?: boolean;
  repositories?: string[];
  teamMembers?: TeamMember[];
};

type SyncOutcome =
  | "added"
  | "ignored"
  | "invalid_config"
  | "removed"
  | "skipped_transiently"
  | "updated";

type DiscoveryResult = {
  accountsScanned: number;
  missingProjectSlugs: string[];
  repositoriesToProcess: GitHubRepositoryMetadata[];
  reposDiscovered: number;
};

type SyncTarget = ParsedRepositoryUrl | GitHubRepositoryMetadata;

const STALE_REVISIT_AFTER_DAYS = 14;

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
    reposInvalidConfig: 0,
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

  if (outcome === "invalid_config") {
    summary.reposInvalidConfig += 1;
    return;
  }

  if (outcome === "skipped_transiently") {
    summary.reposSkippedTransiently += 1;
  }
}

function parseRequestedRepositories(
  repositoryUrls: string[],
): ParsedRepositoryUrl[] {
  return repositoryUrls.flatMap((repositoryUrl) => {
    try {
      return [parseRepositoryUrl(repositoryUrl)];
    } catch (error) {
      console.error(`Failed to parse repository ${repositoryUrl}`, error);
      return [];
    }
  });
}

function hasRepositoryMetadata(
  repository: SyncTarget,
): repository is GitHubRepositoryMetadata {
  return "defaultBranch" in repository;
}

export async function syncRepositories(
  env: AppEnv,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const fetchImpl = options.fetch ?? fetch;
  const currentTime = options.now ?? new Date();
  const now = currentTime.toISOString();
  const db = createDb(env.DB);
  const shouldPruneUntrackedOwners =
    options.pruneUntrackedOwners ??
    (options.repositories === undefined && options.teamMembers === undefined);
  const requestedRepositories = options.repositories
    ? parseRequestedRepositories([...new Set(options.repositories)])
    : null;
  const discovery = requestedRepositories
    ? null
    : await resolveTrackedRepositories(
        db,
        fetchImpl,
        currentTime,
        options.teamMembers ?? TEAM_MEMBERS,
        env.GITHUB_TOKEN,
      );
  const summary = createEmptySummary(
    discovery?.accountsScanned ?? 0,
    discovery?.reposDiscovered ?? 0,
  );

  if (shouldPruneUntrackedOwners) {
    summary.reposRemoved += await deleteProjectsByOwnersNotIn(
      db,
      TEAM_MEMBERS.map((member) => member.login),
    );
  }

  for (const slug of discovery?.missingProjectSlugs ?? []) {
    await deleteProjectBySlug(db, slug);
    summary.reposRemoved += 1;
  }

  for (const repository of requestedRepositories ??
    discovery?.repositoriesToProcess ??
    []) {
    try {
      applyOutcome(
        summary,
        await syncRepository(db, fetchImpl, repository, now, env.GITHUB_TOKEN),
      );
    } catch (error) {
      console.error(`Failed to sync repository ${repository.url}`, error);
    }
  }

  return summary;
}

async function resolveTrackedRepositories(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  currentTime: Date,
  teamMembers: TeamMember[],
  githubToken?: string,
): Promise<DiscoveryResult> {
  const discoveredRepositories = new Map<string, GitHubRepositoryMetadata>();
  const repositoriesToProcess = new Map<string, GitHubRepositoryMetadata>();
  const missingProjectSlugs = new Set<string>();
  const teamLogins = new Set(teamMembers.map((teamMember) => teamMember.login));
  const existingProjectsByOwner = new Map<
    string,
    Map<string, { lastSeenAt: string; slug: string }>
  >();
  const staleCutoff = new Date(currentTime);

  staleCutoff.setUTCDate(staleCutoff.getUTCDate() - STALE_REVISIT_AFTER_DAYS);

  for (const row of await listProjectSyncStateByOwners(db, [...teamLogins])) {
    const knownProjects =
      existingProjectsByOwner.get(row.owner) ??
      new Map<string, { lastSeenAt: string; slug: string }>();
    knownProjects.set(row.repoUrl, {
      lastSeenAt: row.lastSeenAt,
      slug: row.slug,
    });
    existingProjectsByOwner.set(row.owner, knownProjects);
  }

  for (const teamMember of teamMembers) {
    try {
      const accountRepositories = await discoverRepositoriesForTeamMember(
        fetchImpl,
        teamMember,
        githubToken,
      );
      const knownProjects =
        existingProjectsByOwner.get(teamMember.login) ??
        new Map<string, { lastSeenAt: string; slug: string }>();
      const discoveredUrls = new Set<string>();

      for (const repository of accountRepositories) {
        discoveredRepositories.set(repository.url, repository);
        discoveredUrls.add(repository.url);

        const existingProject = knownProjects.get(repository.url);

        if (
          !existingProject ||
          new Date(existingProject.lastSeenAt) <= staleCutoff
        ) {
          repositoriesToProcess.set(repository.url, repository);
        }
      }

      for (const [repositoryUrl, existingProject] of knownProjects) {
        if (!discoveredUrls.has(repositoryUrl)) {
          missingProjectSlugs.add(existingProject.slug);
        }
      }
    } catch (error) {
      console.error(
        `Failed to discover repositories for ${teamMember.login}`,
        error,
      );
    }
  }

  return {
    accountsScanned: teamMembers.length,
    missingProjectSlugs: [...missingProjectSlugs].sort(),
    repositoriesToProcess: [...repositoriesToProcess.values()].sort(
      (left, right) => left.url.localeCompare(right.url),
    ),
    reposDiscovered: discoveredRepositories.size,
  };
}

async function syncRepository(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  repository: SyncTarget,
  now: string,
  githubToken?: string,
): Promise<SyncOutcome> {
  const existing = await getProjectByOwnerRepo(
    db,
    repository.owner,
    repository.repo,
  );

  const repositoryMetadataResult = hasRepositoryMetadata(repository)
    ? { kind: "found" as const, metadata: repository }
    : await fetchRepositoryMetadata(fetchImpl, repository, githubToken);

  if (repositoryMetadataResult.kind === "not_found") {
    if (!existing) {
      return "ignored";
    }

    await deleteProjectBySlug(db, repository.slug);
    return "removed";
  }

  if (repositoryMetadataResult.kind !== "found") {
    return "skipped_transiently";
  }

  const repositoryMetadata = repositoryMetadataResult.metadata;
  const repoPage = await fetchRepositoryPage(fetchImpl, repository);
  const repoPageMetadata =
    repoPage.kind === "found"
      ? extractRepositoryPageMetadata(repoPage.html)
      : {
          homepageUrl: null,
          previewImageUrl: null,
        };

  const previewImageResult = await validatePreviewImageUrl(
    fetchImpl,
    repoPageMetadata.previewImageUrl,
  );
  const wranglerFile = await fetchFirstAvailableRawFile(
    fetchImpl,
    repository,
    WRANGLER_FILE_NAMES,
    repositoryMetadata.defaultBranch,
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

  let wranglerConfig;

  try {
    wranglerConfig = parseWranglerConfig(
      wranglerFile.file.contents,
      wranglerFile.file.fileName,
    );
  } catch {
    return "invalid_config";
  }

  const products = inferCloudflareProducts(wranglerConfig);

  let readmeMarkdown = existing?.readmeMarkdown ?? "";
  let readmePreviewMarkdown = existing?.readmePreviewMarkdown ?? "";

  if (!existing) {
    const readmeFile = await fetchFirstAvailableRawFile(
      fetchImpl,
      repository,
      README_FILE_NAMES,
      repositoryMetadata.defaultBranch,
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
    repoCreationOrder: repositoryMetadata.repoCreationOrder,
    repoCreatedAt: repositoryMetadata.repoCreatedAt,
    homepageUrl:
      repoPageMetadata.homepageUrl ?? repositoryMetadata.homepageUrl ?? null,
    branch: wranglerFile.file.branch,
    wranglerPath: wranglerFile.file.fileName,
    wranglerFormat: getWranglerFormat(wranglerFile.file.fileName),
    readmeMarkdown,
    readmePreviewMarkdown,
    previewImageUrl:
      previewImageResult.kind === "valid"
        ? previewImageResult.url
        : previewImageResult.kind === "transient_error"
          ? (existing?.previewImageUrl ?? null)
          : repoPage.kind === "found"
            ? null
            : (existing?.previewImageUrl ?? null),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  };

  await upsertProject(db, project);
  await replaceProjectProducts(db, project.slug, products);

  return existing ? "updated" : "added";
}
