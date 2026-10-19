---
'@pikku/better-auth': patch
---

Under `pikku dev`, signing in as a virtual user now grants the roles and app scope its `defineVirtualUsers` declaration names. Pass the app's `scopeService` to `pikkuVirtualUser({ scopeService })` (the starter template does); each sign-in grants what the account is missing and never revokes. A deployed stage still grants nothing on sign-in and leaves it to `provisionVirtualUsers`. Apps no longer have to seed a virtual user's roles by hand for local development.
