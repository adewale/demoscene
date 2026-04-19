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

const VIDEO_HOSTS = new Set([
  "loom.com",
  "player.vimeo.com",
  "user-images.githubusercontent.com",
  "vimeo.com",
  "www.loom.com",
  "www.youtube.com",
  "youtu.be",
  "youtube.com",
]);

type PresenceLink = {
  label: string | null;
  line: string;
  url: string;
};

export type ProjectPresenceItem = {
  href: string;
  kind: "github" | "live" | "video";
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
    !isVideoCandidate(url) &&
    !NON_LIVE_HOSTS.has(hostname) &&
    !isGenericCloudflareHost,
  );
}

function isVideoCandidate(url: string): boolean {
  const parsed = normalizeUrl(url);

  if (!parsed) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  return (
    VIDEO_HOSTS.has(hostname) ||
    pathname.endsWith(".mov") ||
    pathname.endsWith(".mp4")
  );
}

function pickVideoUrl(links: PresenceLink[]): string | null {
  const videoLink = links.find(
    (link) =>
      isVideoCandidate(link.url) ||
      /\b(video|watch demo|demo clip|walkthrough|loom)\b/i.test(
        link.label ?? "",
      ) ||
      /\b(video|watch demo|demo clip|walkthrough|loom)\b/i.test(link.line),
  );

  return videoLink?.url ?? null;
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
  const videoUrl = pickVideoUrl([...markdownLinks, ...inlineLinks]);

  if (liveUrl && !seenUrls.has(liveUrl)) {
    items.push({ href: liveUrl, kind: "live", label: "Live" });
    seenUrls.add(liveUrl);
  }

  if (videoUrl && !seenUrls.has(videoUrl)) {
    items.push({ href: videoUrl, kind: "video", label: "Video" });
    seenUrls.add(videoUrl);
  }

  items.push({ href: repoUrl, kind: "github", label: "GitHub" });

  return items;
}
