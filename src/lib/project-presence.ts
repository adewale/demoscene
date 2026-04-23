const NON_LIVE_HOSTS = new Set([
  "deploy.workers.cloudflare.com",
  "developers.cloudflare.com",
  "docs.github.com",
  "astro.build",
  "dash.cloudflare.com",
  "github.com",
  "opengraph.githubassets.com",
  "raw.githubusercontent.com",
  "react.dev",
  "www.cloudflare.com",
]);

type PresenceLink = {
  label: string | null;
  line: string;
  url: string;
};

type ProjectPresenceItem = {
  href: string;
  kind: "github" | "live";
  label: string;
};

type PresenceInput = {
  homepageUrl: string | null;
  readmeMarkdown: string;
  repoUrl: string;
};

function extractMarkdownLinks(markdown: string): PresenceLink[] {
  const links: PresenceLink[] = [];

  for (const line of markdown.split("\n")) {
    for (const match of line.matchAll(
      /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    )) {
      links.push({
        label: match[1] ?? null,
        line,
        url: match[2] ?? "",
      });
    }
  }

  return links;
}

function extractInlineUrls(markdown: string): PresenceLink[] {
  const links: PresenceLink[] = [];

  for (const line of markdown.split("\n")) {
    for (const match of line.matchAll(/(https?:\/\/[^\s)`]+)/g)) {
      links.push({
        label: null,
        line,
        url: match[1] ?? "",
      });
    }
  }

  return links;
}

function normalizeUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isLiveCandidate(url: string): boolean {
  const parsed = normalizeUrl(url);
  const hostname = parsed?.hostname.toLowerCase() ?? "";

  const isGenericCloudflareHost =
    hostname.endsWith(".cloudflare.com") &&
    !hostname.endsWith(".workers.dev") &&
    !hostname.endsWith(".pages.dev");

  return Boolean(
    parsed &&
    parsed.protocol === "https:" &&
    !NON_LIVE_HOSTS.has(hostname) &&
    !isGenericCloudflareHost,
  );
}

function pickLiveUrl(
  homepageUrl: string | null,
  markdownLinks: PresenceLink[],
  inlineLinks: PresenceLink[],
): string | null {
  if (homepageUrl && isLiveCandidate(homepageUrl)) {
    return homepageUrl;
  }

  const explicitMarkdownLiveLink = markdownLinks.find(
    (link) =>
      isLiveCandidate(link.url) &&
      (/\b(live|live site|site|app|demo app|launch|deployed|production|preview)\b/i.test(
        link.label ?? "",
      ) ||
        /\b(live|live site|site|app|demo app|launch|deployed|production|preview)\b/i.test(
          link.line,
        )),
  );

  if (explicitMarkdownLiveLink) {
    return explicitMarkdownLiveLink.url;
  }

  const inlineLiveLink = inlineLinks.find(
    (link) =>
      isLiveCandidate(link.url) &&
      /\b(live|live site|deployed api|deployment|production|preview)\b/i.test(
        link.line,
      ),
  );

  return inlineLiveLink?.url ?? null;
}

export function extractProjectPresence({
  homepageUrl,
  readmeMarkdown,
  repoUrl,
}: PresenceInput): ProjectPresenceItem[] {
  const markdownLinks = extractMarkdownLinks(readmeMarkdown);
  const inlineLinks = extractInlineUrls(readmeMarkdown);
  const items: ProjectPresenceItem[] = [];
  const seenUrls = new Set<string>();
  const liveUrl = pickLiveUrl(homepageUrl, markdownLinks, inlineLinks);

  if (liveUrl && !seenUrls.has(liveUrl)) {
    items.push({ href: liveUrl, kind: "live", label: "Live" });
    seenUrls.add(liveUrl);
  }

  items.push({ href: repoUrl, kind: "github", label: "GitHub" });

  return items;
}
