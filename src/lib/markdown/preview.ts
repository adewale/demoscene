type PreviewOptions = {
  maxBlocks: number;
  maxChars: number;
};

const DEFAULT_OPTIONS: PreviewOptions = {
  maxBlocks: 4,
  maxChars: 620,
};

function isImageOnlyBlock(block: string): boolean {
  const trimmed = block.trim();
  return /^!?\[[^\]]*\]\([^)]*\)$/.test(trimmed);
}

function stripLeadingRepositoryHeading(markdown: string, repo: string): string {
  const normalized = markdown.trim();

  if (!normalized) {
    return "";
  }

  const blocks = normalized.split(/\n\s*\n/g);
  const firstBlock = blocks[0]?.trim() ?? "";
  const slug = repo.replace(/[._-]+/g, " ").toLowerCase();
  const headingText = firstBlock
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase();

  if (headingText !== slug) {
    return normalized;
  }

  return blocks.slice(1).join("\n\n").trim() || normalized;
}

function stripPreviewNoise(markdown: string): string {
  return markdown
    .split("\n")
    .filter(
      (line) =>
        !line.includes("deploy.workers.cloudflare.com/button") &&
        !/\[!\[[^\]]*deploy to cloudflare/i.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function takeFirstParagraphs(markdown: string, count: number): string {
  return markdown
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, count)
    .join("\n\n");
}

function normalizeMarkdownHeadings(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index] ?? "";
    const nextLine = lines[index + 1]?.trim() ?? "";
    const atxHeadingMatch = currentLine.match(
      /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/,
    );

    if (atxHeadingMatch) {
      normalized.push(atxHeadingMatch[1] ?? "");
      continue;
    }

    if (currentLine.trim() && /^([=-])\1{1,}\s*$/.test(nextLine)) {
      normalized.push(currentLine.trim());
      index += 1;
      continue;
    }

    normalized.push(currentLine);
  }

  return normalized.join("\n");
}

function clampToMaxChars(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const clamped = value.slice(0, maxChars).trimEnd();
  return clamped.replace(/[\s.,;:!?-]+$/u, "");
}

export function deriveMarkdownPreview(
  markdown: string,
  options?: Partial<PreviewOptions>,
): string {
  const { maxBlocks, maxChars } = { ...DEFAULT_OPTIONS, ...options };
  const normalized = normalizeMarkdownHeadings(markdown).trim();

  if (!normalized) {
    return "";
  }

  const blocks = normalized
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isImageOnlyBlock(block));

  if (blocks.length === 0) {
    return clampToMaxChars(normalized, maxChars);
  }

  const selected: string[] = [];

  for (const block of blocks) {
    const nextValue = [...selected, block].join("\n\n");

    if (selected.length > 0 && nextValue.length > maxChars) {
      break;
    }

    selected.push(block);

    if (selected.length >= maxBlocks || nextValue.length >= maxChars) {
      break;
    }
  }

  return clampToMaxChars(selected.join("\n\n") || normalized, maxChars);
}

export function formatMarkdownPreviewForCard(
  markdown: string,
  repo: string,
): string {
  return takeFirstParagraphs(
    stripPreviewNoise(stripLeadingRepositoryHeading(markdown, repo)),
    2,
  );
}
