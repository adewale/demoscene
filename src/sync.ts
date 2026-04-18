import type { AppEnv, ProjectRecord } from "./domain";
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

function getWranglerFormat(fileName: string): string {
  if (fileName.endsWith(".toml")) {
    return "toml";
  }

  if (fileName.endsWith(".jsonc")) {
    return "jsonc";
  }

  return "json";
}

export async function syncRepositories(
  env: AppEnv,
  options: SyncOptions = {},
): Promise<void> {
  const fetchImpl = options.fetch ?? fetch;
  const now = (options.now ?? new Date()).toISOString();
  const db = createDb(env.DB);
  const repositories = options.repositories
    ? [...new Set(options.repositories)]
    : await resolveTrackedRepositories(
        db,
        fetchImpl,
        options.teamMembers ?? TEAM_MEMBERS,
      );

  for (const repositoryUrl of repositories) {
    try {
      await syncRepository(db, fetchImpl, repositoryUrl, now);
    } catch (error) {
      console.error(`Failed to sync repository ${repositoryUrl}`, error);
    }
  }
}

async function resolveTrackedRepositories(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  teamMembers: TeamMember[],
): Promise<string[]> {
  const repositories = new Set<string>();
  const teamLogins = new Set(teamMembers.map((teamMember) => teamMember.login));

  for (const teamMember of teamMembers) {
    try {
      const discoveredRepositories = await discoverRepositoriesForTeamMember(
        fetchImpl,
        teamMember,
      );

      for (const repositoryUrl of discoveredRepositories) {
        repositories.add(repositoryUrl);
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
      repositories.add(project.repoUrl);
    }
  }

  return [...repositories].sort();
}

async function syncRepository(
  db: ReturnType<typeof createDb>,
  fetchImpl: FetchLike,
  repositoryUrl: string,
  now: string,
): Promise<void> {
  const repository = parseRepositoryUrl(repositoryUrl);
  const repoPage = await fetchRepositoryPage(fetchImpl, repository);

  if (repoPage.kind === "not_found") {
    await deleteProjectBySlug(db, repository.slug);
    return;
  }

  if (repoPage.kind !== "found") {
    return;
  }

  const repoMetadata = extractRepositoryPageMetadata(repoPage.html);
  const wranglerFile = await fetchFirstAvailableRawFile(
    fetchImpl,
    repository,
    WRANGLER_FILE_NAMES,
  );

  if (wranglerFile.kind === "transient_error") {
    return;
  }

  if (wranglerFile.kind === "not_found") {
    await deleteProjectBySlug(db, repository.slug);
    return;
  }

  const wranglerConfig = parseWranglerConfig(
    wranglerFile.file.contents,
    wranglerFile.file.fileName,
  );
  const products = inferCloudflareProducts(wranglerConfig);
  const existing = await getProjectByOwnerRepo(
    db,
    repository.owner,
    repository.repo,
  );

  let readmeMarkdown = existing?.readmeMarkdown ?? "";
  let readmePreviewMarkdown = existing?.readmePreviewMarkdown ?? "";

  if (!existing) {
    const readmeFile = await fetchFirstAvailableRawFile(
      fetchImpl,
      repository,
      README_FILE_NAMES,
    );

    if (readmeFile.kind === "transient_error") {
      return;
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
}
