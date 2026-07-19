---
'@pikku/better-auth': patch
---

`credentialOAuthProviders` now skips an OAuth2 credential whose app secret is
UNCONFIGURED (the secret does not exist yet) instead of throwing. Previously a
single unconfigured provider — e.g. an installed addon's OAuth2 credential the
operator has not set up (now that addon credential meta is merged into the
consuming app's `CREDENTIAL_OAUTH2_CONFIGS`) — threw `Requested secret not
found` while building the auth instance, which took down the ENTIRE better-auth
instance: every `getSession` and sign-up 500'd. Missing app secrets are logged
at `warn` (pass the singleton `logger` as the optional third argument) and the
provider is left out; a secret that IS present but malformed (no `clientId`)
still throws as a genuine misconfiguration.
