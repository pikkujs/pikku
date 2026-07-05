---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/console': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
---

Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

`@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.
