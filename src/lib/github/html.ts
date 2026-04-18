type RepositoryPageMetadata = {
  homepageUrl: string | null;
  previewImageUrl: string | null;
};

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(amp|quot|#39|lt|gt);/g,
    (match) => ENTITY_MAP[match] ?? match,
  );
}

function extractTags(html: string, tagName: string): string[] {
  return html.match(new RegExp(`<${tagName}\\b[\\s\\S]*?>`, "gi")) ?? [];
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    const name = match[1]?.toLowerCase();
    const value = match[3];

    if (!name || value === undefined) {
      continue;
    }

    attributes[name] = decodeHtmlEntities(value);
  }

  return attributes;
}

function extractOgImageUrl(html: string): string | null {
  for (const tag of extractTags(html, "meta")) {
    const attributes = parseAttributes(tag);

    if (
      attributes.property?.toLowerCase() === "og:image" &&
      attributes.content
    ) {
      return attributes.content;
    }
  }

  return null;
}

function isExternalHomepageLink(attributes: Record<string, string>): boolean {
  const href = attributes.href;
  const rel = attributes.rel?.toLowerCase() ?? "";
  const target = attributes.target?.toLowerCase() ?? "";

  return (
    Boolean(href?.startsWith("https://")) &&
    (attributes["data-testid"] === "repository-homepage-url" ||
      rel.includes("nofollow") ||
      target === "_blank")
  );
}

function extractHomepageUrl(html: string): string | null {
  for (const tag of extractTags(html, "a")) {
    const attributes = parseAttributes(tag);

    if (isExternalHomepageLink(attributes)) {
      return attributes.href ?? null;
    }
  }

  return null;
}

export function extractRepositoryPageMetadata(
  html: string,
): RepositoryPageMetadata {
  return {
    homepageUrl: extractHomepageUrl(html),
    previewImageUrl: extractOgImageUrl(html),
  };
}
