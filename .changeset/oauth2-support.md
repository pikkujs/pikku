---
'@pikku/core': minor
'@pikku/cli': minor
'@pikku/inspector': minor
---

Add OAuth2 support with CLI commands for credential management

**@pikku/core:**

- Added `@pikku/core/oauth2` module with `OAuth2Client`, `OAuth2Config`, and related types
- Added `wireOAuth2Credential` for wiring OAuth2 credentials
- Extended `SecretService` interface with `setSecretJSON`, `deleteSecret`, and `hasSecret` methods
- `LocalSecretService` now supports in-memory secret storage and `hasSecret` checking
- `ScopedSecretService` implements `hasSecret` with access control
- Added `CredentialDefinitions` type for credential validation
- `OAuth2Client` now properly refreshes expired tokens loaded from secrets

**@pikku/cli:**

- Added `oauth:connect <credential>` command to authorize OAuth2 credentials
  - Starts a temporary HTTP callback server
  - Opens browser for authorization flow
  - Supports `--url` option for custom callback URL
  - Supports `--output` option (console or secret)
- Added `oauth:status <credential>` command to check token status
- Added `oauth:disconnect <credential>` command to remove stored tokens
- Added `TypedSecretService` wrapper generation for compile-time validated secret access
  - Generates `CredentialsMap` interface mapping secretIds to their TypeScript types
  - Provides `getSecretJSON()`, `setSecretJSON()`, `hasSecret()`, `getAllStatus()`, and `getMissing()` methods
  - Type inference works with both Zod schemas (`wireCredential`) and OAuth2 types (`wireOAuth2Credential`)
- CLI now validates credentials sharing the same secretId have identical schemas
  - Multiple credentials can reference the same secretId (useful for shared secrets across packages)
  - Errors only if same secretId is defined with different schemas

**@pikku/inspector:**

- Credential definitions now stored as array for validation
- Added `sourceFile` tracking to credential metadata
