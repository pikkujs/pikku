# @pikku/addon-graph

## 0.12.4

### Patch Changes

- 0a2af8b: Stop addon packages from rebuilding via the workspace pikku CLI at publish time.

  `npx changeset publish` runs up to 10 `npm publish` processes concurrently, and
  `@pikku/cli`'s publish build (`build.sh`) starts with `rm -rf -- .pikku dist`.
  An addon whose `prepublishOnly` ran the workspace CLI (`pikku all`, or a
  `build.sh` invoking `cli/dist/bin/pikku.js`) could read `packages/cli/dist`
  mid-wipe and fail with `Cannot find module '.../cli/dist/src/services.js'`,
  breaking the release. `yarn release` already builds every package before
  publishing, so the `prepublishOnly` rebuild was redundant; it has been removed
  from both addons and a `check:no-publish-rebuild` guard now fails CI if any
  published package reintroduces a publish-time CLI rebuild.

## 0.12.3

### Patch Changes

- 4f8917f: Fix publish builds by falling back to a published CLI when the local workspace CLI binary is unavailable during release packaging.

## 0.12.2

### Patch Changes

- 9060165: Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.0.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2
