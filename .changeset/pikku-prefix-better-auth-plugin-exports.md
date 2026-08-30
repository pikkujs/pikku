---
'@pikku/better-auth': patch
'@pikku/inspector': patch
'@pikku/addon-admin': patch
'@pikku/skills': patch
'@pikku/cli': patch
---

Prefix the better-auth plugin factories with `pikku`: `pikkuActor`, `pikkuBan`,
`pikkuFabric`, `pikkuDelegatedAuth` and `pikkuCredentialOAuth`.

A `betterAuth({ plugins: [...] })` array mixes this package's plugins with
better-auth's own, and until now nothing at the call site told them apart —
`plugins: [actor(...), ban(), fabric(...), organization()]` reads as four
plugins from one place when only the last is better-auth's. The prefix says
which package a plugin came from where it is actually wired.

The old names are still exported as deprecated aliases bound to the same
functions, so no import has to change. Nothing about the plugins themselves
moved: the `id` each registers under — `pikku-ban`, `actor`, `fabric`,
`delegated-auth`, `credential-oauth` — is unchanged, so no deployed database or
session is affected.

The pieces that read a plugin's _export_ name rather than its id accept both:
`PLUGIN_REGISTRY` is keyed under the prefixed and the bare name, and the
`pikku validate` ban/actor checks and the `scaffold.userAdmin` ban check count
either spelling as wired. Their messages now point at the new names.
