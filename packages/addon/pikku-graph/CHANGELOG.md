# @pikku/addon-graph

## 0.12.2

### Patch Changes

- 7f146f7: Fix packaging so the published tarball is actually consumable.

  The previous `package.json#exports` entry mapped `./.pikku/*` to the top-level `./.pikku/*` directory, but `npm pack` only picks up the JSON-format files there — the compiled `pikku-bootstrap.gen.js` and friends only land under `./dist/.pikku/`. Consumers importing `@pikku/addon-graph/.pikku/pikku-bootstrap.gen.js` (which the pikku CLI does on every project that depends on this addon) hit `ERR_MODULE_NOT_FOUND`. Aligns the layout with `@pikku/addon-console`:
  - `exports."./.pikku/*"` now resolves under `./dist/.pikku/`.
  - `files` drops the unbuilt top-level `.pikku/` directory.
  - `imports."#pikku"` gets a `import` resolution pointing at the compiled output.
  - `build` no longer copies the unbuilt `.pikku/` over the compiled output, so the dist tree stays clean.

  No source changes — addons consuming `@pikku/addon-graph` previously failed to boot; now they boot.

- Updated dependencies [8860aff]
- Updated dependencies [d484d0c]
  - @pikku/core@0.12.21

## 0.0.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2
