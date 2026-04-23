import { TEAM_MEMBERS } from "../config/repositories";
import type { ProjectWithProducts } from "../domain";
import { extractProjectPresence } from "./project-presence";
import { RSS_ITEM_LIMIT } from "./sync-policy";

const RSS_SUMMARY_PARAGRAPH_LIMIT = 1;
const TEAM_MEMBER_NAME_BY_LOGIN = new Map(
  TEAM_MEMBERS.map((member) => [member.login, member.name]),
);

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LOW_SIGNAL_RSS_HEADINGS = new Set(
  [
    "features",
    "how it works",
    "stack",
    "tech stack",
    "what you'll build",
    "what you ll build",
  ].map(normalizeComparableText),
);

function humanizeSlug(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function extractReadmeHeading(markdown: string): string | null {
  const htmlHeadingMatch = markdown.match(/<h[1-6]\b[^>]*>([^]*?)<\/h[1-6]>/i);

  if (htmlHeadingMatch?.[1]) {
    const heading = stripMarkdown(htmlHeadingMatch[1]).trim();

    if (heading) {
      return heading;
    }
  }

  const atxHeadingMatch = markdown.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);

  if (atxHeadingMatch?.[1]) {
    return stripMarkdown(atxHeadingMatch[1]).trim() || null;
  }

  const setextHeadingMatch = markdown.match(/^([^\n]+)\n([=-])\2+\s*$/m);

  if (setextHeadingMatch?.[1]) {
    return stripMarkdown(setextHeadingMatch[1]).trim() || null;
  }

  return null;
}

function joinNaturalList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function getOwnerDisplayName(project: ProjectWithProducts): string {
  return (
    TEAM_MEMBER_NAME_BY_LOGIN.get(project.owner) ?? humanizeSlug(project.owner)
  );
}

function getProjectDisplayName(project: ProjectWithProducts): string {
  const repoDisplayName = humanizeSlug(project.repo);
  const heading =
    extractReadmeHeading(project.readmeMarkdown) ??
    extractReadmeHeading(project.readmePreviewMarkdown);

  if (!heading) {
    return repoDisplayName;
  }

  if (
    normalizeComparableText(heading) === normalizeComparableText(project.repo)
  ) {
    return repoDisplayName;
  }

  return heading;
}

function renderBuiltWithSentence(project: ProjectWithProducts): string | null {
  const labels = project.products.map((product) => product.label);

  if (labels.length === 0) {
    return null;
  }

  return `Built with ${joinNaturalList(labels)}.`;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\(([^)]+)\)/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\]\(([^)]+)\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paragraphize(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function isDuplicateTitleParagraph(
  paragraph: string,
  project: ProjectWithProducts,
): boolean {
  const normalizedParagraph = normalizeComparableText(paragraph);
  const projectDisplayName = getProjectDisplayName(project);

  if (!normalizedParagraph) {
    return false;
  }

  return [projectDisplayName, project.repo, project.slug].some(
    (candidate) => normalizeComparableText(candidate) === normalizedParagraph,
  );
}

function isLowSignalHeadingParagraph(paragraph: string): boolean {
  return LOW_SIGNAL_RSS_HEADINGS.has(normalizeComparableText(paragraph));
}

function renderRssDescription(project: ProjectWithProducts): string {
  const presence = extractProjectPresence({
    homepageUrl: project.homepageUrl,
    readmeMarkdown: project.readmeMarkdown,
    repoUrl: project.repoUrl,
  }).filter((item) => item.kind !== "github");
  const summaryParagraphs = paragraphize(
    stripMarkdown(project.readmePreviewMarkdown),
  )
    .filter(
      (paragraph, index) =>
        !(index === 0 && isDuplicateTitleParagraph(paragraph, project)),
    )
    .filter((paragraph) => !isLowSignalHeadingParagraph(paragraph))
    .slice(0, RSS_SUMMARY_PARAGRAPH_LIMIT);
  const builtWithSentence = renderBuiltWithSentence(project);
  const actionLinks = [
    `<a href="${escapeXml(project.repoUrl)}">GitHub</a>`,
    ...presence.map(
      (item) =>
        `<a href="${escapeXml(item.href)}">${escapeXml(item.label)}</a>`,
    ),
  ].join(" &middot; ");

  return [
    ...summaryParagraphs.map((paragraph) => `<p>${escapeXml(paragraph)}</p>`),
    builtWithSentence ? `<p>${escapeXml(builtWithSentence)}</p>` : null,
    `<p>${actionLinks}</p>`,
  ]
    .filter(Boolean)
    .join("");
}

function renderRssItem(project: ProjectWithProducts): string {
  const description = renderRssDescription(project);
  const publishedAt = project.repoCreatedAt;
  const ownerDisplayName = getOwnerDisplayName(project);
  const projectDisplayName = getProjectDisplayName(project);

  return [
    "<item>",
    `<title>${escapeXml(`${ownerDisplayName} started building ${projectDisplayName}`)}</title>`,
    `<link>${escapeXml(project.repoUrl)}</link>`,
    `<guid isPermaLink="true">${escapeXml(project.repoUrl)}</guid>`,
    `<pubDate>${new Date(publishedAt).toUTCString()}</pubDate>`,
    `<dc:creator>${escapeXml(project.owner)}</dc:creator>`,
    ...project.products.map(
      (product) => `<category>${escapeXml(product.label)}</category>`,
    ),
    `<description><![CDATA[${description}]]></description>`,
    `<content:encoded><![CDATA[${description}]]></content:encoded>`,
    "</item>",
  ].join("");
}

export function getRssItems(
  items: ProjectWithProducts[],
): ProjectWithProducts[] {
  return items.slice(0, RSS_ITEM_LIMIT);
}

export function getRssLastBuildDate(items: ProjectWithProducts[]): string {
  const lastBuildDate = items.reduce<string | null>((latest, item) => {
    const candidate = item.lastSeenAt ?? item.firstSeenAt;

    if (!latest || new Date(candidate) > new Date(latest)) {
      return candidate;
    }

    return latest;
  }, null);

  return (lastBuildDate ?? new Date().toISOString()).toString();
}

export function renderRssFeed(options: {
  items: ProjectWithProducts[];
  origin: string;
}): string {
  const origin = options.origin;
  const items = getRssItems(options.items);
  const lastBuildDate = getRssLastBuildDate(items);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    "<title>demoscene</title>",
    `<link>${escapeXml(origin)}</link>`,
    "<description>New Cloudflare projects discovered from the team GitHub feed.</description>",
    "<language>en</language>",
    `<atom:link href="${escapeXml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    `<lastBuildDate>${new Date(lastBuildDate).toUTCString()}</lastBuildDate>`,
    ...items.map((item) => renderRssItem(item)),
    "</channel>",
    "</rss>",
  ].join("");
}
