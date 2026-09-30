---
'@pikku/better-auth': patch
---

The OAuth proxy is now switched on by `OAUTH_PROXY_URL` and `OAUTH_PROXY_PROVIDERS`, not by `OAUTH_PROXY_SECRET`. `pikku db generate` loads the auth factory with a stub that answers every secret read with a made-up value, so a secret alone looked like a half-configured proxy and failed the command with "OAuth proxy is partly configured". A secret with no variables is now ignored; variables without the secret still fail at start and name it.
