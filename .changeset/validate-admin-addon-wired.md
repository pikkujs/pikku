---
'@pikku/cli': patch
---

`pikku validate` reports an app that authenticates with better-auth but never
wires `@pikku/addon-admin` (`admin-addon-not-wired`): it exposes no `admin:*`
RPCs, so the console's Users and Scopes pages have nothing to call.
