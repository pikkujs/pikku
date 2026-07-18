---
'@pikku/inspector': patch
---

Merge an addon's credential meta into the consuming app during inspection, the
same way addon secrets and variables are already merged. Without this, a
credential declared by an addon (e.g. an OAuth2 integration) never reached the
app's `CREDENTIAL_OAUTH2_CONFIGS`, so the `credential-oauth` provider and the
credential service could not resolve it — the addon's Connect flow and status
silently no-op'd. Addon credentials are added as fallbacks: an app-declared
credential of the same name still wins.
