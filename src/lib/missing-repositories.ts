import type { SyncMode } from "../domain";
import {
  parseRepositoryUrl,
  type ParsedRepositoryUrl,
} from "./github/repositories";

export function resolveMissingRepositories(options: {
  discoveredUrls: Set<string>;
  knownProjects: Map<string, { slug: string }>;
  mode: SyncMode;
}): {
  missingProjectSlugs: string[];
  repositoriesToVerify: ParsedRepositoryUrl[];
} {
  const missingProjectSlugs: string[] = [];
  const repositoriesToVerify: ParsedRepositoryUrl[] = [];

  for (const [repositoryUrl, existingProject] of options.knownProjects) {
    if (options.discoveredUrls.has(repositoryUrl)) {
      continue;
    }

    if (options.mode === "reconcile") {
      missingProjectSlugs.push(existingProject.slug);
      continue;
    }

    try {
      repositoriesToVerify.push(parseRepositoryUrl(repositoryUrl));
    } catch (error) {
      console.error(`Failed to parse repository ${repositoryUrl}`, error);
    }
  }

  return {
    missingProjectSlugs,
    repositoriesToVerify,
  };
}
