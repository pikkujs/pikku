---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

Add `pikku sdk`, which packs an addon's remote contract into a types-only `<scope>-<name>-<version>.sdk.tgz` (manifest, remote RPC map, exposed workflow map, agent map, and remote/exposed function meta with contract hashes). The command refuses any import outside the SDK and `@pikku/core`, and with `--bump-from` it refuses a version below the bump the contract change requires. Inside an addon, a `remote: true` function typed with generics or a named source type is now critical PKU922: its input and output must be zod schemas.
