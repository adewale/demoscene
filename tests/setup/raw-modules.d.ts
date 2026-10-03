declare module "*.sql?raw" {
  const contents: string;
  export default contents;
}

declare module "*.html?raw" {
  const contents: string;
  export default contents;
}

declare module "*.json?raw" {
  const contents: string;
  export default contents;
}

declare module "*.jsonc?raw" {
  const contents: string;
  export default contents;
}

// The eager raw-string form of Vite's `import.meta.glob`, as used by
// tests/integration/support/d1.ts to load every migration.
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { eager: true; import: "default"; query: "?raw" },
  ): Record<string, T>;
}
