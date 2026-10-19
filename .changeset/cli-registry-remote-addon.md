---
'@pikku/cli': patch
---

The CLI calls the addon registry through the registry's own SDK, wired with `wireRemoteAddon`, in place of a hand-written client. The SDK and its `pikku-addons.lock` entry are committed, so the CLI's own `pikku all` syncs it offline.
