---
'@pikku/better-auth': patch
---

Remove the bare aliases for the five better-auth plugin factories.

`actor`, `ban`, `credentialOAuth`, `delegatedAuth` and `fabric` were kept beside
`pikkuActor`, `pikkuBan`, `pikkuCredentialOAuth`, `pikkuDelegatedAuth` and
`pikkuFabric` when the factories were renamed. Two exported names for one value
is what the rename set out to end — a bare `fabric()` or `actor()` in a
`plugins: [...]` list is indistinguishable from better-auth's own factories —
and it left the repo failing its own duplicate-export check.

Rename any remaining call: `actor(...)` becomes `pikkuActor(...)`, and so on.
The plugins and their ids are unchanged.
