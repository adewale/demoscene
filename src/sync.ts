import type {
  AppEnv,
  ProjectRecord,
  RepositoryScanStateRecord,
  SyncMode,
  SyncSummary,
} from "./domain";
import { TEAM_MEMBERS, type TeamMember } from "./config/repositories";
import { createDb } from "./db/client";
import {
  deleteProjectsByOwnersNotIn,
  deleteProjectBySlug,
  deleteRepositoryScanStateByRepoUrl,
  getProjectByOwnerRepo,
  listProjectSyncStateByOwners,
  listRepositoryScanStateByOwners,
  replaceProjectProducts,
  upsertRepositoryScanState,
  upsertProject,
} from "./db/queries";
import {
  discoverRepositoriesForTeamMember,
  fetchRepositoryMetadata,
  fetchFirstAvailableRawFile,
  fetchRepositoryPage,
  GitHubRateLimitError,
  type GitHubRepositoryMetadata,
  PACKAGE_FILE_NAMES,
  README_FILE_NAMES,
  type FetchLike,
  validatePreviewImageUrl,
  WRANGLER_FILE_NAMES,
} from "./lib/github/fetch";
import { extractRepositoryPageMetadata } from "./lib/github/html";
import { deriveMarkdownPreview } from "./lib/markdown/preview";
import {
  getRepositoryScanNextCheckAt,
  shouldProcessDiscoveredRepository,
} from "./lib/sync-policy";
import {
  type CloudflareProduct,
  inferCloudflareProducts,
  parsePackageManifest,
  parseWranglerConfig,
  sortCloudflareProducts,
} from "./lib/wrangler/parse";

import {
  parseRepositoryUrl,
  type ParsedRepositoryUrl,
} from "./lib/github/repositories";

type SyncOptions = {
  fetch?: FetchLike;
  mode?: SyncMode;
  now?: Date;
  pruneUntrackedOwners?: boolean;
  repositories?: string[];
  teamMembers?: TeamMember[];
};

type SyncOutcome =
  | "added"
  | "deferred_by_rate_limit"
  | "ignored"
  | "invalid_config"
  | "removed"
  | "skipped_transiently"
  | "updated";

type SyncResult = {
  outcome: SyncOutcome;
  retryAfter?: string | null;
};

type DiscoveryResult = {
  accountsFailed: number;
  accountsScanned: number;
  accountsSucceeded: number;
  missingProjectSlugs: string[];
  rateLimitedUntil: string | null;
  repositoriesToProcess: GitHubRepositoryMetadata[];
  reposDiscovered: number;
};

type SyncTarget = ParsedRepositoryUrl | GitHubRepositoryMetadata;

const PACKAGE_DERIVED_PRODUCT_KEYS = new Set(["agents", "sandboxes"]);

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
  accountsSucceeded = 0,
  accountsFailed = 0,
  reposDiscovered = 0,
): SyncSummary {
  return {
    accountsScanned,
    accountsFailed,
    accountsSucceeded,
    reposAdded: 0,
    reposDeferredByRateLimit: 0,
    reposDiscovered,
    reposInvalidConfig: 0,
    reposRemoved: 0,
    reposSkippedTransiently: 0,
    reposUpdated: 0,
    rateLimitedUntil: null,
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

function updateRateLimit(
  summary: SyncSummary,
  retryAfter?: string | null,
): void {
  if (!retryAfter) {
    return;
  }

  if (!summary.rateLimitedUntil) {
    summary.rateLimitedUntil = retryAfter;
    return;
  }

  summary.rateLimitedUntil =
    new Date(retryAfter) > new Date(summary.rateLimitedUntil)
      ? retryAfter
      : summary.rateLimitedUntil;
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

function preservePackageDerivedProducts(
  products: CloudflareProduct[],
  existingProducts: CloudflareProduct[],
): CloudflareProduct[] {
  const merged = [...products];

  for (const product of existingProducts) {
    if (
      PACKAGE_DERIVED_PRODUCT_KEYS.has(product.key) &&
      !merged.some((candidate) => candidate.key === product.key)
    ) {
      merged.push(product);
    }
  }

  return sortCloudflareProducts(merged);
}

export async function syncRepositories(
  env: AppEnv,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const fetchImpl = options.fetch ?? fetch;
  const mode = options.mode ?? "reconcile";
  const currentTime = options.now ?? new Date();
  const db = createDb(env.DB);
  const shouldPruneUntrackedOwners =
    options.pruneUntrackedOwners ??
    (mode === "reconcile" &&
      options.repositories === undefined &&
      options.teamMembers === undefined);
  const requestedRepositories = options.repositories
    ? parseRequestedRepositories([...new Set(options.repositories)])
    : null;
  const discovery = requestedRepositories
    ? null
    : await resolveTrackedRepositories(
        db,
        fetchImpl,
        currentTime,
        mode,
        options.teamMembers ?? TEAM_MEMBERS,
        env.GITHUB_TOKEN,
      );
  const summary = createEmptySummary(
    discovery?.accountsScanned ?? 0,
    discovery?.accountsSucceeded ?? 0,
    discovery?.accountsFailed ?? 0,
    discovery?.reposDiscovered ?? 0,
  );
  updateRateLimit(summary, discovery?.rateLimitedUntil ?? null);

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

  const repositoriesToProcess =
    requestedRepositories ?? discovery?.repositoriesToProcess ?? [];

  for (const [index, repository] of repositoriesToProcess.entries()) {
    try {
      const result = await syncRepository(
        db,
        fetchImpl,
        repository,
        currentTime,
        env.GITHUB_TOKEN,
      );

      if (result.outcome === "deferred_by_rate_limit") {
        summary.reposDeferredByRateLimit +=
          repositoriesToProcess.length - index;
        updateRateLimit(summary, result.retryAfter ?? null);
        break;
      }

      applyOutcome(summary, result.outcome);
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
  mode: SyncMode,
  teamMembers: TeamMember[],
  githubToken?: string,
): Promise<DiscoveryResult> {
  let accountsFailed = 0;
  let accountsScanned = 0;
  let accountsSucceeded = 0;
  const discoveredRepositories = new Map<string, GitHubRepositoryMetadata>();
  const repositoriesToProcess = new Map<string, GitHubRepositoryMetadata>();
  const missingProjectSlugs = new Set<string>();
  const repositoryScanStateByUrl = new Map<string, RepositoryScanStateRecord>();
  const teamLogins = new Set(teamMembers.map((teamMember) => teamMember.login));
  const existingProjectsByOwner = new Map<
    string,
    Map<string, { lastSeenAt: string; slug: string }>
  >();

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

  for (const row of await listRepositoryScanStateByOwners(db, [
    ...teamLogins,
  ])) {
    repositoryScanStateByUrl.set(row.repoUrl, row);
  }

  for (const teamMember of teamMembers) {
    accountsScanned += 1;

    try {
      const accountRepositories = await discoverRepositoriesForTeamMember(
        fetchImpl,
        teamMember,
        githubToken,
      );
      accountsSucceeded += 1;
      const knownProjects =
        existingProjectsByOwner.get(teamMember.login) ??
        new Map<string, { lastSeenAt: string; slug: string }>();
      const discoveredUrls = new Set<string>();

      for (const repository of accountRepositories) {
        discoveredRepositories.set(repository.url, repository);
        discoveredUrls.add(repository.url);

        const existingProject = knownProjects.get(repository.url);
        const negativeState = repositoryScanStateByUrl.get(repository.url);

        if (
          shouldProcessDiscoveredRepository({
            existingProjectLastSeenAt: existingProject?.lastSeenAt ?? null,
            mode,
            negativeScanNextCheckAt: negativeState?.nextCheckAt ?? null,
            now: currentTime,
          })
        ) {
          repositoriesToProcess.set(repository.url, repository);
        }
      }

      if (mode === "reconcile") {
        for (const [repositoryUrl, existingProject] of knownProjects) {
          if (!discoveredUrls.has(repositoryUrl)) {
            missingProjectSlugs.add(existingProject.slug);
          }
        }
      }
    } catch (error) {
      accountsFailed += 1;

      if (error instanceof GitHubRateLimitError) {
        return {
          accountsFailed,
          accountsScanned,
          accountsSucceeded,
          missingProjectSlugs: [...missingProjectSlugs].sort(),
          rateLimitedUntil: error.retryAfter,
          repositoriesToProcess: [...repositoriesToProcess.values()],
          reposDiscovered: discoveredRepositories.size,
        };
      }

      console.error(
        `Failed to discover repositories for ${teamMember.login}`,
        error,
      );
    }
  }

  return {
    accountsFailed,
    accountsScanned,
    accountsSucceeded,
    missingProjectSlugs: [...missingProjectSlugs].sort(),
    rateLimitedUntil: null,
    repositoriesToProcess: [...repositoriesToProcess.values()],
    reposDiscovered: discoveredRepositories.size,
  };
}

async function syncRepository(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  repository: SyncTarget,
  currentTime: Date,
  githubToken?: string,
): Promise<SyncResult> {
  const now = currentTime.toISOString();
  const existing = await getProjectByOwnerRepo(
    db,
    repository.owner,
    repository.repo,
  );

  const repositoryMetadataResult = hasRepositoryMetadata(repository)
    ? { kind: "found" as const, metadata: repository }
    : await fetchRepositoryMetadata(fetchImpl, repository, githubToken);

  if (repositoryMetadataResult.kind === "not_found") {
    await deleteRepositoryScanStateByRepoUrl(db, repository.url);

    if (!existing) {
      return { outcome: "ignored" };
    }

    await deleteProjectBySlug(db, repository.slug);
    return { outcome: "removed" };
  }

  if (repositoryMetadataResult.kind === "rate_limited") {
    return {
      outcome: "deferred_by_rate_limit",
      retryAfter: repositoryMetadataResult.retryAfter,
    };
  }

  if (repositoryMetadataResult.kind !== "found") {
    return { outcome: "skipped_transiently" };
  }

  const repositoryMetadata = repositoryMetadataResult.metadata;
  const wranglerFile = await fetchFirstAvailableRawFile(
    fetchImpl,
    repository,
    WRANGLER_FILE_NAMES,
    repositoryMetadata.defaultBranch,
  );

  if (wranglerFile.kind === "rate_limited") {
    return {
      outcome: "deferred_by_rate_limit",
      retryAfter: wranglerFile.retryAfter,
    };
  }

  if (wranglerFile.kind === "transient_error") {
    return { outcome: "skipped_transiently" };
  }

  if (wranglerFile.kind === "not_found") {
    await upsertRepositoryScanState(db, {
      lastCheckedAt: now,
      nextCheckAt: getRepositoryScanNextCheckAt("ignored", currentTime),
      owner: repository.owner,
      repo: repository.repo,
      repoUrl: repository.url,
      status: "ignored",
    });

    if (!existing) {
      return { outcome: "ignored" };
    }

    await deleteProjectBySlug(db, repository.slug);
    return { outcome: "removed" };
  }

  let wranglerConfig;

  try {
    wranglerConfig = parseWranglerConfig(
      wranglerFile.file.contents,
      wranglerFile.file.fileName,
    );
  } catch {
    await upsertRepositoryScanState(db, {
      lastCheckedAt: now,
      nextCheckAt: getRepositoryScanNextCheckAt("invalid_config", currentTime),
      owner: repository.owner,
      repo: repository.repo,
      repoUrl: repository.url,
      status: "invalid_config",
    });

    return { outcome: "invalid_config" };
  }

  const packageFile = await fetchFirstAvailableRawFile(
    fetchImpl,
    repository,
    PACKAGE_FILE_NAMES,
    repositoryMetadata.defaultBranch,
  );
  let packageManifest;

  if (packageFile.kind === "rate_limited") {
    return {
      outcome: "deferred_by_rate_limit",
      retryAfter: packageFile.retryAfter,
    };
  }

  if (packageFile.kind === "found") {
    try {
      packageManifest = parsePackageManifest(packageFile.file.contents);
    } catch {
      packageManifest = undefined;
    }
  }

  const products =
    packageFile.kind === "transient_error" && existing
      ? preservePackageDerivedProducts(
          inferCloudflareProducts(wranglerConfig),
          existing.products,
        )
      : inferCloudflareProducts(wranglerConfig, packageManifest);

  const repoPage = await fetchRepositoryPage(fetchImpl, repository);

  if (repoPage.kind === "rate_limited") {
    return {
      outcome: "deferred_by_rate_limit",
      retryAfter: repoPage.retryAfter,
    };
  }

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

  let readmeMarkdown = existing?.readmeMarkdown ?? "";
  let readmePreviewMarkdown = existing?.readmePreviewMarkdown ?? "";

  if (!existing) {
    const readmeFile = await fetchFirstAvailableRawFile(
      fetchImpl,
      repository,
      README_FILE_NAMES,
      repositoryMetadata.defaultBranch,
    );

    if (readmeFile.kind === "rate_limited") {
      return {
        outcome: "deferred_by_rate_limit",
        retryAfter: readmeFile.retryAfter,
      };
    }

    if (readmeFile.kind === "transient_error") {
      return { outcome: "skipped_transiently" };
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
  await deleteRepositoryScanStateByRepoUrl(db, repository.url);

  return { outcome: existing ? "updated" : "added" };
}
