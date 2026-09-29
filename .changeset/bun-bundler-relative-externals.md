---
'@pikku/cli': patch
---

The Bun bundler now keeps a relative external (`./sqlite-extensions.gen.js`, `./frontend-assets.gen.js`) as an import instead of inlining it, so a standalone bun binary built with the CLI under bun embeds its sqlite extensions and frontend assets again rather than looking for them on disk at `./vec0-<hash>.so`.
