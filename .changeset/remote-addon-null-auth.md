---
'@pikku/core': patch
---

A `wireRemoteAddon` `auth.resolve` may return `null` to send a call without a credential, for a host whose surface is public. An empty or undefined token still fails closed.
