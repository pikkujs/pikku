---
'@pikku/cli': patch
---

Make carved addons publishable as-is and let runnable addon projects boot under `pikku dev`.

- **Addon presentation metadata now lives under `addon` (an object), not a dead `node` key.** The node-meta codegen reads `config.addon` (`typeof addon === 'object' ? addon : undefined`), so the previous `addon: true` + sibling `node: { displayName, … }` left the generated package metadata (displayName/description/icon/categories) empty. Both the from-scratch scaffold and the carve now write the metadata under `addon`.
- **Carve preserves source metadata + ships the icon.** A source project (a normal, `pikku dev`-runnable project) can carry its addon presentation metadata under a `node` block in `pikku.config.json` — a key `pikku dev`/codegen ignore — and the carve lifts it into the addon's `addon` block (merged with `carve: true`). The referenced icon file is copied from the source project root into the addon, so `addon.icon` no longer dangles.
- **Carve generates real package-root re-exports.** `src/index.ts` now re-exports each carved function (`export { fn } from './functions/…js'`) instead of a placeholder comment, so the documented `import { fn } from '@pikku/addon-<name>'` entrypoint resolves.
- **`pikku dev` injects a default schema service.** A minimal project (e.g. a runnable addon whose functions have zod schemas) now boots without wiring its own `schema` service — the HTTP server compiles function schemas at init. A project that returns its own `schema` still overrides the default (`pikkuServices` merges `{ ...existingServices, ...createdServices }`).
- **Carve excludes the internal remote-RPC scaffold.** The auto-generated `remoteRPCHandler` (tagged `pikku`, in `src/scaffold/rpc-remote.gen.ts`) is no longer bundled into a carved addon. It imports `wireHTTP`/`wireQueueWorker`, which a carved addon's `pikku-types.gen.ts` (addon/IoC mode) does not export — so bundling it made the addon fail to compile. Only user functions are carved now.
- **`node` is a recognized config key.** `PikkuCLIConfig` now models the optional `node` presentation-metadata block (the key a runnable source project carries for the carve to lift into `addon`), so `pikku.config.json` no longer reports a schema violation for it.
