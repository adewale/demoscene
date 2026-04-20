import type { ProjectWithProducts } from "../domain";
import { extractProjectPresence } from "./project-presence";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
    .filter(Boolean)
    .slice(0, 3);
}

function renderRssDescription(project: ProjectWithProducts): string {
  const presence = extractProjectPresence({
    homepageUrl: project.homepageUrl,
    readmeMarkdown: project.readmeMarkdown,
    repoUrl: project.repoUrl,
  }).filter((item) => item.kind !== "github");
  const paragraphs = paragraphize(stripMarkdown(project.readmePreviewMarkdown));
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
    `<p><strong>${escapeXml(project.owner)}/${escapeXml(project.repo)}</strong></p>`,
    productLabels
      ? `<p><strong>Cloudflare:</strong> ${escapeXml(productLabels)}</p>`
      : null,
    ...paragraphs.map((paragraph) => `<p>${escapeXml(paragraph)}</p>`),
    project.previewImageUrl
      ? `<p><img src="${escapeXml(project.previewImageUrl)}" alt="${escapeXml(project.repo)} preview" /></p>`
      : null,
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

export function renderRssFeed(options: {
  items: ProjectWithProducts[];
  origin: string;
}): string {
  const { items, origin } = options;
  const lastBuildDate =
    items[0]?.lastSeenAt ?? items[0]?.firstSeenAt ?? new Date().toISOString();

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
