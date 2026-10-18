---
'@pikku/better-auth': patch
---

Importing `@pikku/better-auth` no longer generates random values, so a Cloudflare Worker that bundles it starts again. The dev quick-login password is minted on first use instead of at import.
