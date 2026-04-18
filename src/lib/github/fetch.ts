import type { TeamMember } from "../../config/repositories";
import type { ParsedRepositoryUrl } from "./repositories";
import {
  buildRawFileCandidates,
  buildRepositoriesPageUrl,
  extractRepositoryUrlsFromAccountPage,
} from "./repositories";

export type FetchLike = typeof fetch;

type RawFileResult = {
  branch: string;
  fileName: string;
  contents: string;
};

type RawFileLookupResult =
  | {
      kind: "found";
      file: RawFileResult;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "transient_error";
    };

type RepositoryPageResult =
  | {
      kind: "found";
      html: string;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "transient_error";
    };

export const README_FILE_NAMES = ["README.md"];
export const WRANGLER_FILE_NAMES = [
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
];

function isNotFoundStatus(status: number): boolean {
  return status === 404;
}

function isTransientStatus(status: number): boolean {
  return (
    status === 403 ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export async function fetchRepositoryPage(
  fetchImpl: FetchLike,
  repository: ParsedRepositoryUrl,
): Promise<RepositoryPageResult> {
  try {
    const response = await fetchImpl(repository.url);

    if (response.ok) {
      return {
        kind: "found",
        html: await response.text(),
      };
    }

    if (isNotFoundStatus(response.status)) {
      return { kind: "not_found" };
    }

    return { kind: "transient_error" };
  } catch {
    return { kind: "transient_error" };
  }
}

export async function discoverRepositoriesForTeamMember(
  fetchImpl: FetchLike,
  teamMember: TeamMember,
  maxPages = 10,
): Promise<string[]> {
  const repositoryUrls = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchImpl(
      buildRepositoriesPageUrl(teamMember.login, page),
    );

    if (response.status === 404) {
      break;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to discover repositories for ${teamMember.login} on page ${page}: ${response.status}`,
      );
    }

    const html = await response.text();
    const discovery = extractRepositoryUrlsFromAccountPage(
      html,
      teamMember.login,
    );

    for (const repositoryUrl of discovery.repositoryUrls) {
      repositoryUrls.add(repositoryUrl);
    }

    if (!discovery.hasNextPage) {
      break;
    }
  }

  return [...repositoryUrls].sort();
}

export async function fetchFirstAvailableRawFile(
  fetchImpl: FetchLike,
  repository: ParsedRepositoryUrl,
  fileNames: string[],
): Promise<RawFileLookupResult> {
  const candidates = buildRawFileCandidates(
    repository.owner,
    repository.repo,
    fileNames,
  );
  let sawTransientError = false;

  for (const candidate of candidates) {
    try {
      const response = await fetchImpl(candidate.url);

      if (!response.ok) {
        if (
          !isNotFoundStatus(response.status) &&
          isTransientStatus(response.status)
        ) {
          sawTransientError = true;
        }

        continue;
      }

      return {
        kind: "found",
        file: {
          branch: candidate.branch,
          fileName: candidate.fileName,
          contents: await response.text(),
        },
      };
    } catch {
      sawTransientError = true;
    }
  }

  return sawTransientError
    ? { kind: "transient_error" }
    : { kind: "not_found" };
}
