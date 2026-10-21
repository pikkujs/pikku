---
'@pikku/cli': patch
---

The default addon registry is `https://api.pikkustudio.app`, not `https://registry.pikkustudio.app`. A `pikku.config.json` without `registry` now resolves versioned `wireRemoteAddon` packages against the host that serves `registry:resolveSdk`.
