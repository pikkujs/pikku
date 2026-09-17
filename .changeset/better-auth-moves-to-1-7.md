---
'@pikku/better-auth': patch
'@pikku/tanstack-start': patch
'@pikku/console': patch
'@pikku/next': patch
'@pikku/cli': patch
---

better-auth moves to 1.7.5

The internal adapter renamed `findAccountByProviderId(accountId, providerId)` to
`findAccountByKey({ providerId, accountId })`, `createUser` now takes the
provisioning source as a second argument, and `generateState` takes its link
target by name rather than by position. The actor, fabric and delegated plugins
each name themselves as the provisioning method, so an app's `validateUserInfo`
hook can tell which one created a user.

`get-access-token` and `unlink-account` also changed their body to a strict
schema selecting the account by its own row id rather than by provider name, so
`BetterAuthCredentialService` resolves the row through the internal adapter
before asking for a token — which also means an unlinked provider is answered
without a round trip.
