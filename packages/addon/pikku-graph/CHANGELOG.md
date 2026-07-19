# @pikku/addon-graph

## 0.12.6

### Patch Changes

- cb079cc: `graph:httpRequest` gains an optional `auth` descriptor (bearer/apiKeyHeader/apiKeyQuery/basic) resolved from the `SecretService` at request time; `oauth2` is a guarded not-yet-supported error.
- cb079cc: Rename the `graph:map` addon function (and its `Map*` types) to `graph:fanout`, which better names invoking a child RPC once per element and collecting ordered results.
- cb079cc: Map n8n's Aggregate `aggregateAllItemData` mode onto `graph:aggregate` (new additive `includeAllItems` flag), converting ~164 previously-stubbed Aggregate nodes into real graph functions.
- cb079cc: Map n8n's Merge `append` mode (and mode-less Merge default) onto a new `graph:concat` addon function that flattens all input streams, converting ~103 previously-stubbed Merge nodes.
- cb079cc: Import n8n RAG flows (v1) — retrieval-as-tool, chainRetrievalQa, and ingestion — as runnable vector-store addon calls driven by a new `rag-map`, plus a new `graph:splitText` builtin.
- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.12.5

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

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
