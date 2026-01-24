---
'@pikku/core': minor
'@pikku/cli': minor
---

Add OAuth2 support with CLI commands for credential management

**@pikku/core:**
- Added `@pikku/core/oauth2` module with `OAuth2Client`, `OAuth2Config`, and related types
- Added `wireOAuth2Credential` for wiring OAuth2 credentials
- Extended `SecretService` interface with `setSecretJSON` and `deleteSecret` methods
- `LocalSecretService` now supports in-memory secret storage

**@pikku/cli:**
- Added `oauth:connect <credential>` command to authorize OAuth2 credentials
  - Starts a temporary HTTP callback server
  - Opens browser for authorization flow
  - Supports `--url` option for custom callback URL
  - Supports `--output` option (console or secret)
- Added `oauth:status <credential>` command to check token status
- Added `oauth:disconnect <credential>` command to remove stored tokens
