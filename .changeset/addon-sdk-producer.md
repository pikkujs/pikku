---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

For an addon, `pikku all` now packs its remote contract into a types-only `.pikku/sdk/` and `<scope>-<name>-<version>.sdk.tgz` at the package.json version (manifest, remote RPC map, exposed workflow map, agent map, and remote/exposed function meta with contract hashes and schemas). The archive is deterministic, and the SDK refuses any import outside itself and `@pikku/core`. Inside an addon, a `remote: true` function typed with generics or a named source type is now critical PKU922: its input and output must be zod schemas.
