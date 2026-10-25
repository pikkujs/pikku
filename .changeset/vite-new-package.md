---
'@pikku/vite': patch
---

New package. `pikkuVite()` is the one line a Pikku frontend adds to `vite.config.ts`: it applies `testIds()` (the `data-testid` and Pikku Studio source-anchor transform that apps used to copy into `build/`) and, when the project has Better Auth, the cross-site session relay from `@pikku/better-auth/vite`, reading `pikku.config.json` to decide.
