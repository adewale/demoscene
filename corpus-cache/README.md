# Corpus Cache

Committed offline cache of the current `demoscene` corpus.

Contents:

- `manifest.json` with the cached project list and source URLs
- `projects/:owner/:repo/` with:
  - the tracked Wrangler config
  - `package.json` when present
  - `metadata.json` describing the cached files

Refresh it with:

```bash
npm run corpus:refresh
```
