import type { TeamMember } from "../../config/repositories";
import type { GitHubResponseCacheRecord } from "../../domain";
import type { ParsedRepositoryUrl } from "./repositories";
import {
  buildRepositoryApiUrl,
  buildRawFileCandidates,
  buildUserRepositoriesApiUrl,
  hasNextPageLink,
} from "./repositories";

export type FetchLike = typeof fetch;

export type GitHubApiCache = {
  get: (requestUrl: string) => Promise<GitHubResponseCacheRecord | null>;
  put: (entry: GitHubResponseCacheRecord) => Promise<void>;
};

export type GitHubRepositoryMetadata = ParsedRepositoryUrl & {
  defaultBranch: string;
  homepageUrl: string | null;
  repoCreatedAt: string;
  repoCreationOrder: number;
};

type RateLimitedResult = {
  kind: "rate_limited";
  retryAfter: string | null;
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
    }
  | RateLimitedResult;

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
    }
  | RateLimitedResult;

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
    }
  | RateLimitedResult;

export class GitHubRateLimitError extends Error {
  retryAfter: string | null;

  constructor(retryAfter: string | null) {
    super("GitHub rate limit reached");
    this.name = "GitHubRateLimitError";
    this.retryAfter = retryAfter;
  }
}

function isNotFoundStatus(status: number): boolean {
  return status === 404;
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status >= 500;
}

function isRateLimitedStatus(status: number): boolean {
  return status === 403 || status === 429;
}

function parseRetryAfterValue(value: string): string | null {
  const seconds = Number.parseInt(value, 10);

  if (Number.isFinite(seconds)) {
    return new Date(Date.now() + seconds * 1000).toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function getGitHubRetryAfter(headers: Headers): string | null {
  const retryAfter = headers.get("retry-after");

  if (retryAfter) {
    const parsedRetryAfter = parseRetryAfterValue(retryAfter);

    if (parsedRetryAfter) {
      return parsedRetryAfter;
    }
  }

  const rateLimitReset = headers.get("x-ratelimit-reset");

  if (!rateLimitReset) {
    return null;
  }

  const resetSeconds = Number.parseInt(rateLimitReset, 10);

  if (!Number.isFinite(resetSeconds)) {
    return null;
  }

  return new Date(resetSeconds * 1000).toISOString();
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

function applyConditionalRequestHeaders(
  headers: Headers,
  cachedResponse: GitHubResponseCacheRecord | null,
): Headers {
  if (!cachedResponse) {
    return headers;
  }

  if (cachedResponse.etag) {
    headers.set("If-None-Match", cachedResponse.etag);
  }

  if (cachedResponse.lastModified) {
    headers.set("If-Modified-Since", cachedResponse.lastModified);
  }

  return headers;
}

type CachedGitHubApiResponse = {
  linkHeader: string | null;
  payload: unknown;
};

async function fetchCachedGitHubApiPayload(options: {
  cache?: GitHubApiCache;
  fetchImpl: FetchLike;
  token?: string;
  url: string;
}): Promise<
  | {
      kind: "found";
      response: CachedGitHubApiResponse;
    }
  | {
      kind: "rate_limited";
      retryAfter: string | null;
    }
  | {
      kind: "response";
      response: Response;
    }
> {
  const cachedResponse = options.cache
    ? await options.cache.get(options.url)
    : null;
  const response = await options.fetchImpl(
    new Request(options.url, {
      headers: applyConditionalRequestHeaders(
        createGitHubApiHeaders(options.token),
        cachedResponse,
      ),
    }),
  );

  if (response.status === 304 && cachedResponse) {
    return {
      kind: "found",
      response: {
        linkHeader: cachedResponse.linkHeader,
        payload: JSON.parse(cachedResponse.responseBody),
      },
    };
  }

  if (isRateLimitedStatus(response.status)) {
    return {
      kind: "rate_limited",
      retryAfter: getGitHubRetryAfter(response.headers),
    };
  }

  if (response.ok && options.cache) {
    const responseBody = await response.text();

    await options.cache.put({
      etag: response.headers.get("etag"),
      fetchedAt: new Date().toISOString(),
      lastModified: response.headers.get("last-modified"),
      linkHeader: response.headers.get("link"),
      requestUrl: options.url,
      responseBody,
    });

    return {
      kind: "found",
      response: {
        linkHeader: response.headers.get("link"),
        payload: JSON.parse(responseBody),
      },
    };
  }

  return { kind: "response", response };
}

export function createInMemoryGitHubApiCache(): GitHubApiCache {
  const cacheEntries = new Map<string, GitHubResponseCacheRecord>();

  return {
    async get(requestUrl) {
      return cacheEntries.get(requestUrl) ?? null;
    },
    async put(entry) {
      cacheEntries.set(entry.requestUrl, entry);
    },
  };
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

    if (isRateLimitedStatus(response.status)) {
      return {
        kind: "rate_limited",
        retryAfter: getGitHubRetryAfter(response.headers),
      };
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
  cache?: GitHubApiCache,
): Promise<GitHubRepositoryMetadata[]> {
  const repositories: GitHubRepositoryMetadata[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const requestUrl = buildUserRepositoriesApiUrl(teamMember.login, page);
    const cachedResponse = await fetchCachedGitHubApiPayload({
      cache,
      fetchImpl,
      token,
      url: requestUrl,
    });

    if (cachedResponse.kind === "found") {
      const payload = cachedResponse.response.payload;

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

      if (!hasNextPageLink(cachedResponse.response.linkHeader)) {
        break;
      }

      if (page >= maxPages) {
        throw new Error(
          `Repository discovery for ${teamMember.login} exceeded page limit ${maxPages}`,
        );
      }

      continue;
    }

    if (cachedResponse.kind === "rate_limited") {
      throw new GitHubRateLimitError(cachedResponse.retryAfter);
    }

    const { response } = cachedResponse;

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
  cache?: GitHubApiCache,
): Promise<RepositoryMetadataResult> {
  try {
    const requestUrl = buildRepositoryApiUrl(repository.owner, repository.repo);
    const cachedResponse = await fetchCachedGitHubApiPayload({
      cache,
      fetchImpl,
      token,
      url: requestUrl,
    });

    if (cachedResponse.kind === "found") {
      const metadata = parseGitHubRepositoryMetadata(
        cachedResponse.response.payload,
      );

      if (!metadata) {
        return { kind: "transient_error" };
      }

      return {
        kind: "found",
        metadata,
      };
    }

    if (cachedResponse.kind === "rate_limited") {
      return {
        kind: "rate_limited",
        retryAfter: cachedResponse.retryAfter,
      };
    }

    const { response } = cachedResponse;

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
        if (isRateLimitedStatus(response.status)) {
          return {
            kind: "rate_limited",
            retryAfter: getGitHubRetryAfter(response.headers),
          };
        }

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
