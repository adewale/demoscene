import type { ProjectWithProducts } from "../domain";
import { extractProjectPresence } from "./project-presence";
import { RSS_ITEM_LIMIT } from "./sync-policy";

const RSS_DESCRIPTION_PARAGRAPH_LIMIT = 3;

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

  if (!normalizedParagraph) {
    return false;
  }

  return [project.repo, project.slug, `${project.owner}/${project.repo}`].some(
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
  const paragraphs = paragraphize(stripMarkdown(project.readmePreviewMarkdown))
    .filter(
      (paragraph, index) =>
        !(index === 0 && isDuplicateTitleParagraph(paragraph, project)),
    )
    .filter((paragraph) => !isLowSignalHeadingParagraph(paragraph))
    .slice(0, RSS_DESCRIPTION_PARAGRAPH_LIMIT);
  const productLabels = project.products
    .map((product) => product.label)
    .join(", ");
  const actionLinks = [
    `<a href="${escapeXml(project.repoUrl)}">GitHub</a>`,
    ...presence.map(
      (item) =>
        `<a href="${escapeXml(item.href)}">${escapeXml(item.label)}</a>`,
    ),
  ].join(" &middot; ");

  return [
    productLabels
      ? `<p><strong>Cloudflare:</strong> ${escapeXml(productLabels)}</p>`
      : null,
    ...paragraphs.map((paragraph) => `<p>${escapeXml(paragraph)}</p>`),
    `<p>${actionLinks}</p>`,
  ]
    .filter(Boolean)
    .join("");
}

function renderRssItem(project: ProjectWithProducts): string {
  const description = renderRssDescription(project);
  const publishedAt = project.repoCreatedAt;

  return [
    "<item>",
    `<title>${escapeXml(`${project.owner}/${project.repo}`)}</title>`,
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
