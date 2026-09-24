---
'@pikku/better-auth': patch
---

The `actor` plugin can store upstream credentials for each actor at sign-in. Pass `credentials: { names, store }` and a persona signs in carrying `ACTOR_CREDENTIAL_<PERSONA>_<NAME>` from the environment, stored through `credentialService.set` — so scenarios reach addons that call a third-party API as that persona.
