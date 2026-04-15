import type { AppEnv, ProjectRecord } from "./domain";
import { TRACKED_REPOSITORIES } from "./config/repositories";
import { createDb } from "./db/client";
import {
  deleteProjectBySlug,
  getProjectByOwnerRepo,
  replaceProjectProducts,
  upsertProject,
} from "./db/queries";
import {
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
  const repositories = [
    ...new Set(options.repositories ?? TRACKED_REPOSITORIES),
  ];

  for (const repositoryUrl of repositories) {
    const repository = parseRepositoryUrl(repositoryUrl);
    const repoPage = await fetchRepositoryPage(fetchImpl, repository);

    if (repoPage.status === 404) {
      await deleteProjectBySlug(db, repository.slug);
      continue;
    }

    if (!repoPage.ok || repoPage.html === null) {
      continue;
    }

    const repoMetadata = extractRepositoryPageMetadata(repoPage.html);
    const wranglerFile = await fetchFirstAvailableRawFile(
      fetchImpl,
      repository,
      WRANGLER_FILE_NAMES,
    );

    if (!wranglerFile) {
      await deleteProjectBySlug(db, repository.slug);
      continue;
    }

    const wranglerConfig = parseWranglerConfig(
      wranglerFile.contents,
      wranglerFile.fileName,
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
      readmeMarkdown = readmeFile?.contents ?? "";
      readmePreviewMarkdown = deriveMarkdownPreview(readmeMarkdown);
    }

    const project: ProjectRecord = {
      slug: repository.slug,
      owner: repository.owner,
      repo: repository.repo,
      repoUrl: repository.url,
      homepageUrl: repoMetadata.homepageUrl,
      branch: wranglerFile.branch,
      wranglerPath: wranglerFile.fileName,
      wranglerFormat: getWranglerFormat(wranglerFile.fileName),
      readmeMarkdown,
      readmePreviewMarkdown,
      previewImageUrl: repoMetadata.previewImageUrl,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };

    await upsertProject(db, project);
    await replaceProjectProducts(db, project.slug, products);
  }
}
