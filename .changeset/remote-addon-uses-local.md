---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

`wireRemoteAddon` accepts `uses` (same meaning as `wireAddon`'s, so a remote addon may reach the addons it maps) and `local: { package, ui?, contributors? }`, naming an installed package whose screens and contributors are mounted under the same name as the remote contract. `pikku all` reads them from the local package, and the screens command imports from it.
