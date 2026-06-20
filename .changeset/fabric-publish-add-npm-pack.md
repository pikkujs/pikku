---
'@pikku/cli': patch
---

`pikku fabric publish` now packs with `npm pack` (honouring the package's `files` field and matching a normal install's layout) instead of a hand-rolled tar. `pikku fabric add` installs the artifact into the project's `node_modules/<package-name>/` — the location `wireAddon({ package })` resolves via `require.resolve` — stripping npm's `package/` prefix, instead of copying source into `src/addons/<id>/` where it could not be wired.
