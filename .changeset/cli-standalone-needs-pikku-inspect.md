---
'@pikku/cli': patch
---

A standalone `pikku` (Homebrew, the release binaries) with no `pikku-inspect` beside it now fails with where to put one, instead of falling back to the TypeScript inspector, which cannot run inside a standalone build.
