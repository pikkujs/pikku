---
"@pikku/better-auth": patch
---

`betterAuthStatelessSession` now catches a throwing `secrets.getSecret()` (e.g. during Next.js static export), logs a warning, and skips gracefully instead of crashing.
