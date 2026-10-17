---
'@pikku/core': patch
---

Tighten what `@pikku/core` publishes.

- The tarball now ships only `dist/`, `README.md`, `LICENSE` and `package.json` (a `files` allow-list). It no longer carries `knowledge/`, `scripts/`, `run-tests.sh`, `src/public-surface.json` or the CHANGELOG: 1,055 entries / 961 KB packed down to 723 / 548 KB.
- `build` now deletes `dist/` and `tsconfig.tsbuildinfo` first, so a local publish can no longer ship modules whose sources were deleted.
- `esbuild` is declared as an optional peer dependency (`>=0.28.2 <1`). Only `@pikku/core/dev` needs it; when it is missing, the module runner now fails with an error that names the package to install instead of a bare module-not-found.
- The unused `json-schema` runtime dependency is removed (`@types/json-schema` stays: the emitted `.d.ts` imports from it).
- `@pikku/core/package.json` is exported, and a top-level `types` field points at the root entry's declarations for resolvers that ignore `exports`.
