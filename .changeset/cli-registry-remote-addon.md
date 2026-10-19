---
'@pikku/cli': patch
---

The CLI calls the addon registry through the registry's own SDK, wired with `wireRemoteAddon`, in place of a hand-written client. The CLI's build syncs that SDK like any consumer's, pinned by the committed `pikku-addons.lock`.
