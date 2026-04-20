import type { TeamMember } from "../../config/repositories";
import type { ParsedRepositoryUrl } from "./repositories";
import {
  buildRepositoryApiUrl,
  buildRawFileCandidates,
  buildUserRepositoriesApiUrl,
  hasNextPageLink,
} from "./repositories";

export type FetchLike = typeof fetch;

export type GitHubRepositoryMetadata = ParsedRepositoryUrl & {
  defaultBranch: string;
  homepageUrl: string | null;
  repoCreatedAt: string;
  repoCreationOrder: number;
};

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

type PreviewImageResult =
  | {
      kind: "valid";
      url: string;
    }
  | {
      kind: "missing";
    }
  | {
      kind: "transient_error";
    };

export const README_FILE_NAMES = ["README.md"];
export const PACKAGE_FILE_NAMES = ["package.json"];
export const WRANGLER_FILE_NAMES = [
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
];
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_API_ACCEPT = "application/vnd.github+json";

type RepositoryMetadataResult =
  | {
      kind: "found";
      metadata: GitHubRepositoryMetadata;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "transient_error";
    };

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

function isImageLikeContentType(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }

  return contentType.toLowerCase().startsWith("image/");
}

function createGitHubApiHeaders(token?: string): Headers {
  const headers = new Headers({
    Accept: GITHUB_API_ACCEPT,
    "User-Agent": "demoscene",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  });

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

function parseGitHubRepositoryMetadata(
  value: unknown,
): GitHubRepositoryMetadata | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const repository = value as Partial<{
    created_at: unknown;
    default_branch: unknown;
    homepage: unknown;
    html_url: unknown;
    id: unknown;
    name: unknown;
    owner: unknown;
  }>;

  if (
    typeof repository.created_at !== "string" ||
    typeof repository.default_branch !== "string" ||
    typeof repository.html_url !== "string" ||
    typeof repository.id !== "number" ||
    typeof repository.name !== "string" ||
    typeof repository.owner !== "object" ||
    repository.owner === null
  ) {
    return null;
  }

  const owner = repository.owner as Partial<{ login: unknown }>;

  if (typeof owner.login !== "string") {
    return null;
  }

  return {
    defaultBranch: repository.default_branch,
    homepageUrl:
      typeof repository.homepage === "string" && repository.homepage.trim()
        ? repository.homepage
        : null,
    owner: owner.login,
    repo: repository.name,
    repoCreatedAt: repository.created_at,
    repoCreationOrder: repository.id,
    slug: `${owner.login}/${repository.name}`,
    url: repository.html_url,
  };
}

async function validatePreviewImageRequest(
  fetchImpl: FetchLike,
  url: string,
  method: "HEAD" | "GET",
): Promise<PreviewImageResult> {
  try {
    const response = await fetchImpl(new Request(url, { method }));

    if (!response.ok) {
      if (isNotFoundStatus(response.status)) {
        return { kind: "missing" };
      }

      return isTransientStatus(response.status)
        ? { kind: "transient_error" }
        : { kind: "missing" };
    }

    return isImageLikeContentType(response.headers.get("content-type"))
      ? { kind: "valid", url }
      : { kind: "missing" };
  } catch {
    return { kind: "transient_error" };
  }
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

export async function validatePreviewImageUrl(
  fetchImpl: FetchLike,
  url: string | null,
): Promise<PreviewImageResult> {
  if (!url) {
    return { kind: "missing" };
  }

  const headResult = await validatePreviewImageRequest(fetchImpl, url, "HEAD");

  if (headResult.kind === "valid" || headResult.kind === "missing") {
    return headResult;
  }

  return validatePreviewImageRequest(fetchImpl, url, "GET");
}

export async function discoverRepositoriesForTeamMember(
  fetchImpl: FetchLike,
  teamMember: TeamMember,
  token?: string,
  maxPages = Number.MAX_SAFE_INTEGER,
): Promise<GitHubRepositoryMetadata[]> {
  const repositories: GitHubRepositoryMetadata[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchImpl(
      new Request(buildUserRepositoriesApiUrl(teamMember.login, page), {
        headers: createGitHubApiHeaders(token),
      }),
    );

    if (response.status === 404) {
      break;
    }

    if (!response.ok) {
      throw new Error(
        `Failed to discover repositories for ${teamMember.login} on page ${page}: ${response.status}`,
      );
    }

    const payload = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error(
        `Invalid repository payload for ${teamMember.login} on page ${page}`,
      );
    }

    repositories.push(
      ...payload
        .map((item) => parseGitHubRepositoryMetadata(item))
        .filter((item): item is GitHubRepositoryMetadata => item !== null),
    );

    if (!hasNextPageLink(response.headers.get("link"))) {
      break;
    }

    if (page >= maxPages) {
      throw new Error(
        `Repository discovery for ${teamMember.login} exceeded page limit ${maxPages}`,
      );
    }
  }

  return repositories.sort((left, right) => {
    const createdComparison = right.repoCreatedAt.localeCompare(
      left.repoCreatedAt,
    );

    if (createdComparison !== 0) {
      return createdComparison;
    }

    return right.repoCreationOrder - left.repoCreationOrder;
  });
}

export async function fetchRepositoryMetadata(
  fetchImpl: FetchLike,
  repository: ParsedRepositoryUrl,
  token?: string,
): Promise<RepositoryMetadataResult> {
  try {
    const response = await fetchImpl(
      new Request(buildRepositoryApiUrl(repository.owner, repository.repo), {
        headers: createGitHubApiHeaders(token),
      }),
    );

    if (!response.ok) {
      if (isNotFoundStatus(response.status)) {
        return { kind: "not_found" };
      }

      return isTransientStatus(response.status)
        ? { kind: "transient_error" }
        : { kind: "not_found" };
    }

    const metadata = parseGitHubRepositoryMetadata(await response.json());

    if (!metadata) {
      return { kind: "transient_error" };
    }

    return {
      kind: "found",
      metadata,
    };
  } catch {
    return { kind: "transient_error" };
  }
}

export async function fetchFirstAvailableRawFile(
  fetchImpl: FetchLike,
  repository: ParsedRepositoryUrl,
  fileNames: string[],
  preferredBranch?: string | null,
): Promise<RawFileLookupResult> {
  const candidates = buildRawFileCandidates(
    repository.owner,
    repository.repo,
    fileNames,
    preferredBranch,
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
