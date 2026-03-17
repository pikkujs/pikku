---
"@pikku/core": patch
---

Improve LocalContent URL signing with proper signedAt/expiresAt parameters. When an optional JWTService is provided, URLs include a cryptographic signature for verification.
