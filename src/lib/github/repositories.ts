const GITHUB_HOST = "github.com";
const GITHUB_API_HOST = "api.github.com";
const BRANCHES = ["main", "master"] as const;

export type ParsedRepositoryUrl = {
  owner: string;
  repo: string;
  slug: string;
  url: string;
};

type RawFileCandidate = {
  branch: string;
  fileName: string;
  url: string;
};

export function normalizeRepositoryUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

export function buildUserRepositoriesApiUrl(
  login: string,
  page: number,
  perPage = 100,
): string {
  return `https://${GITHUB_API_HOST}/users/${encodeURIComponent(login)}/repos?sort=created&direction=desc&per_page=${perPage}&page=${page}`;
}

export function buildRepositoryApiUrl(owner: string, repo: string): string {
  return `https://${GITHUB_API_HOST}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function hasNextPageLink(linkHeader: string | null): boolean {
  if (!linkHeader) {
    return false;
  }

  return linkHeader
    .split(",")
    .some((part) => /rel="?next"?/i.test(part.trim()));
}

export function parseRepositoryUrl(input: string): ParsedRepositoryUrl {
  const normalized = normalizeRepositoryUrl(input);
  const url = new URL(normalized);

  if (url.protocol !== "https:" || url.hostname !== GITHUB_HOST) {
    throw new Error(`Unsupported repository URL: ${input}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length !== 2) {
    throw new Error(
      `Repository URL must match https://github.com/:owner/:repo: ${input}`,
    );
  }

  const [owner, repo] = segments;

  return {
    owner,
    repo,
    slug: `${owner}/${repo}`,
    url: `https://${GITHUB_HOST}/${owner}/${repo}`,
  };
}

export function buildRawFileCandidates(
  owner: string,
  repo: string,
  fileNames: string[],
  preferredBranch?: string | null,
): RawFileCandidate[] {
  const branches = [preferredBranch, ...BRANCHES].filter(
    (branch, index, values): branch is string =>
      Boolean(branch) && values.indexOf(branch) === index,
  );

  return fileNames.flatMap((fileName) =>
    branches.map((branch) => ({
      branch,
      fileName,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileName}`,
    })),
  );
}
