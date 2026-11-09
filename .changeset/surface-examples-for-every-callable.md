---
'@pikku/cli': patch
'@pikku/core': patch
---

`pikku doc` now shows `hasScopes`, `pikkuAddonConfig`, `refHTTP`, `refChannel`, `refCLI` and `wireRemoteAddon` being used: each carries an `@example snippet:` pointing at a region in `templates/online-shop`. No callable in the shipped surface is left without an example.
