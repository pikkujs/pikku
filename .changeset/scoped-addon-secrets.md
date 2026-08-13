---
'@pikku/addon-console': patch
'@pikku/inspector': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Remove the `secretBroker` escape hatch and scope addon secrets and credentials

`secretBroker` let three named console functions receive the real `SecretService`,
against the rule that a function never sees one. It is gone: the inspector allowlist,
the `FunctionRuntimeMeta` flag, the runner branches, and the `WiredSecretBrokerServices`
type. Console secret administration moved into the console addon, where a
`SecretAdminService` holds the `SecretService` and the functions hold none.

Addons are now scoped rather than trusted. The CLI emits each package's declared secret
keys, and the host wraps the `SecretService` in a `ScopedSecretService` and the
`CredentialService` in a new `ScopedCredentialService` before the addon's service factory
runs — so an addon reads only what it declared, cannot write secrets, and cannot enumerate
the app's users. `wireAddon({ globalSecrets, globalCredentials })` waives this, taking the
reason as its value; only the consuming app can grant it, and the deploy manifest reports
every grant under `unscopedSecretAddons` / `unscopedCredentialAddons`.
