---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/console': patch
---

`pikku audit` tags every advisory and update with `dependencyType: 'prod' | 'dev'`, walking `bun.lock` from each workspace's runtime dependencies without descending into peers or build tools (vite, esbuild, babel, the TanStack Start plugin, the pikku CLI). The console's security view counts only production advisories and folds dev-only ones into a collapsed section.
