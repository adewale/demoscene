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

function extractAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
}

export function extractRepositoryPageMetadata(
  html: string,
): RepositoryPageMetadata {
  const homepageTagMatch = html.match(
    /<a[^>]*data-testid=["']repository-homepage-url["'][^>]*>/i,
  );
  const ogImageTagMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*>/i,
  );

  return {
    homepageUrl: homepageTagMatch
      ? extractAttribute(homepageTagMatch[0], "href")
      : null,
    previewImageUrl: ogImageTagMatch
      ? extractAttribute(ogImageTagMatch[0], "content")
      : null,
  };
}
