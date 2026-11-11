# @pikku/vite

## 0.12.1

### Patch Changes

- b86450a: New package. `pikkuVite()` is the one line a Pikku frontend adds to `vite.config.ts`: it applies `testIds()` (the `data-testid` and Pikku Studio source-anchor transform that apps used to copy into `build/`) and, when the project has Better Auth, the cross-site session relay from `@pikku/better-auth/vite`, reading `pikku.config.json` to decide.
- Updated dependencies [b86450a]
  - @pikku/better-auth@0.12.60
