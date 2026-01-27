---
'@pikku/core': patch
'@pikku/cli': patch
---

Security hardening for OAuth2Client and unit tests

**@pikku/core:**

- Added 30-second timeout to token refresh and code exchange HTTP requests
- Added validation that `access_token` exists and is a string in token responses
- Sanitized error messages to not leak response body contents
- Added comprehensive unit tests for OAuth2Client (28 tests)

**@pikku/cli:**

- OAuth state now uses `crypto.randomUUID()` instead of `Math.random()` for CSRF protection
- Token output now masks sensitive values and warns about shell history exposure
