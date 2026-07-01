---
'@pikku/cli': patch
---

`pikku fabric validate`: add an undeclared-dependency check. Every external module imported from a workspace package's `src/` must be declared in that package's own dependencies/devDependencies/peerDependencies. Such imports type-check locally (via tsconfig `paths` or root workspace hoisting) but the deploy bundle (esbuild / Bun.build) resolves each package independently and fails with "Could not resolve <pkg>" — aborting the deploy. The check flags these before they reach CI (tsconfig path aliases and workspace package names are excluded to avoid false positives).
