---
"@pikku/better-auth": patch
---

Catch getSecret throw in betterAuthStatelessSession

When the secret isn't configured (e.g. during Next.js static export), `secrets.getSecret()` throws instead of returning null. The middleware now catches the error, logs a warning, and skips gracefully rather than crashing.
