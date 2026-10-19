---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

An addon can call another addon with full types. It declares the dependency in its package.json as `"pikku": { "uses": { "stripe": "@pikkustudio/addon-stripe@^0.12.0" } }` and calls `rpc.invoke('stripe:charge', ...)`, `rpc.startWorkflow('stripe:...')` or an agent with no cast. `pikku all` in the addon types `stripe:*` from the dependency's SDK: a workspace package's own `.pikku/sdk`, or a registry SDK pinned in `pikku-addons.lock`.

The app maps the alias with `wireAddon({ ..., uses: { stripe: '<wired name>' } })`, whether the target is wired with `wireAddon` or `wireRemoteAddon`. New codes: PKU354 (the wired instance's version is outside the declared range), PKU355 (`uses` maps a name the addon did not declare), PKU356 (a malformed `pikku.uses` entry). PKU347 and PKU348 now also cover the alias form.

Breaking (fail-closed): for an addon that declares `pikku.uses`, a `wireAddon` `uses` key it did not declare is now an error (PKU355). Agent `run`/`stream` from an addon now go through `uses` like invoke and workflows, so an unmapped agent call throws `AddonNotUsedError`. See docs/MIGRATION.md.
