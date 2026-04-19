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
  const normalized = markdown.replace(/\r\n/g, "\n").trim();

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
