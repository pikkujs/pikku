---
'@pikku/core': minor
'@pikku/cli': minor
---

Add OAuth2 support with CLI commands for credential management

**@pikku/core:**

- Added `@pikku/core/oauth2` module with `OAuth2Client`, `OAuth2Config`, and related types
- Added `wireOAuth2Credential` for wiring OAuth2 credentials
- Extended `SecretService` interface with `setSecretJSON`, `deleteSecret`, and `hasSecret` methods
- `LocalSecretService` now supports in-memory secret storage and `hasSecret` checking
- `ScopedSecretService` implements `hasSecret` with access control

**@pikku/cli:**

- Added `oauth:connect <credential>` command to authorize OAuth2 credentials
  - Starts a temporary HTTP callback server
  - Opens browser for authorization flow
  - Supports `--url` option for custom callback URL
  - Supports `--output` option (console or secret)
- Added `oauth:status <credential>` command to check token status
- Added `oauth:disconnect <credential>` command to remove stored tokens
- Added `PikkuSecrets` typed wrapper generation for compile-time validated secret access
  - Generates `SecretId` union type from `wireCredential` and `wireOAuth2Credential` declarations
  - Provides `get()`, `has()`, `getAllStatus()`, and `getMissing()` methods
  - Useful for UI display and pre-validation of credentials
