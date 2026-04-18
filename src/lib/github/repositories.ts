const GITHUB_HOST = "github.com";
const BRANCHES = ["main", "master"] as const;
const REPOSITORY_LINK_ATTRIBUTES = [
  'data-hovercard-type="repository"',
  "data-hovercard-type='repository'",
  'itemprop="name codeRepository"',
  "itemprop='name codeRepository'",
];

export type ParsedRepositoryUrl = {
  owner: string;
  repo: string;
  slug: string;
  url: string;
};

type RawFileCandidate = {
  branch: (typeof BRANCHES)[number];
  fileName: string;
  url: string;
};

type AccountRepositoryDiscovery = {
  hasNextPage: boolean;
  repositoryUrls: string[];
};

export function normalizeRepositoryUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

function extractAttribute(tag: string, attribute: string): string | null {
  const doubleQuoted = `${attribute}="`;
  const singleQuoted = `${attribute}='`;

  const doubleQuotedStart = tag.indexOf(doubleQuoted);

  if (doubleQuotedStart >= 0) {
    const valueStart = doubleQuotedStart + doubleQuoted.length;
    const valueEnd = tag.indexOf('"', valueStart);
    return valueEnd >= 0 ? tag.slice(valueStart, valueEnd) : null;
  }

  const singleQuotedStart = tag.indexOf(singleQuoted);

  if (singleQuotedStart >= 0) {
    const valueStart = singleQuotedStart + singleQuoted.length;
    const valueEnd = tag.indexOf("'", valueStart);
    return valueEnd >= 0 ? tag.slice(valueStart, valueEnd) : null;
  }

  return null;
}

function isRepositoryAnchorTag(tag: string): boolean {
  return REPOSITORY_LINK_ATTRIBUTES.some((attribute) =>
    tag.includes(attribute),
  );
}

export function buildRepositoriesPageUrl(login: string, page: number): string {
  return `https://${GITHUB_HOST}/${login}?page=${page}&tab=repositories`;
}

export function extractRepositoryUrlsFromAccountPage(
  html: string,
  owner: string,
): AccountRepositoryDiscovery {
  const repositoryUrls = new Set<string>();
  const anchorTags = html.match(/<a\b[^>]*>/gi) ?? [];

  for (const tag of anchorTags) {
    if (!isRepositoryAnchorTag(tag)) {
      continue;
    }

    const href = extractAttribute(tag, "href");

    if (!href) {
      continue;
    }

    const url = new URL(href, `https://${GITHUB_HOST}`);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments.length !== 2 || segments[0] !== owner) {
      continue;
    }

    repositoryUrls.add(`https://${GITHUB_HOST}/${segments[0]}/${segments[1]}`);
  }

  return {
    hasNextPage:
      html.includes('rel="next"') ||
      html.includes("rel='next'") ||
      html.includes('aria-label="Next"') ||
      html.includes("aria-label='Next'"),
    repositoryUrls: [...repositoryUrls].sort(),
  };
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
): RawFileCandidate[] {
  return fileNames.flatMap((fileName) =>
    BRANCHES.map((branch) => ({
      branch,
      fileName,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileName}`,
    })),
  );
}
