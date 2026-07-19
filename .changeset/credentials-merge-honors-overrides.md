---
'@pikku/inspector': patch
---

Apply `credentialOverrides` when merging an addon's credentials into the consuming app, mirroring the existing `secretOverrides`/`variableOverrides` handling. Previously the credentials merge ignored overrides and always registered the addon's logical credential name, so a second instance of the same package (`wireAddon` with a `credentialOverrides` map) failed `validateCredentialOverrides` and both instances shared one OAuth provider. Now each override's resolved name is provisioned as its own credential — and since the credential name doubles as the better-auth providerId, two instances surface two distinct providers instead of a shared account pool.
