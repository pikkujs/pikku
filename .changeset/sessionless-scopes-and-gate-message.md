---
'@pikku/inspector': patch
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

Drop `scopes` from sessionless functions, rename `selfAuthenticated`, and make both
escape hatches opt-in.

**`scopes` are gone from `pikkuSessionlessFunc`.** They are AND-ed and `verifyScopes`
fails closed on a session that does not exist, so every scope listed on a sessionless
function rejected the anonymous caller it exists to serve. `CorePikkuSessionlessFunctionConfig`
now states this once in core, and the generated `pikkuSessionlessFunc` / `pikkuVoidFunc`
configs derive from it — so the field is absent rather than subtracted.

`@pikku/addon-console`'s `installAddon` and `installOpenapiAddon` are now `pikkuFunc`.
Both set `auth: true` and `scopes: ['admin']`, and a test exercises that gate, so the
scopes were load-bearing — they only compiled as sessionless because the config accepted
a field it could not honour. No behaviour change: both already required a session.

**`selfAuthenticated` is now `permissionsInBody`.** It never described authentication:
what it records is that the permission check lives in the function body rather than in a
declared `permissions` entry.

**Both escape hatches must be opted into**, via a new `allow` block in
`pikku.config.json`:

```json
"allow": { "permissionsInBody": true, "complexWorkflows": true }
```

Unset means unavailable, and using the feature is a build error naming the flag that
would permit it — PKU576 for `permissionsInBody`, PKU643 for `pikkuWorkflowComplexFunc`.
Both trade something the tooling can inspect for something only a reader can verify: a
permission check buried in a body, or workflow steps that cannot be serialized into the
graph, replayed, or migrated. Both are occasionally right, and both are the path of least
resistance whenever the declarative form is merely inconvenient. Whoever owns the project
makes that call once, in writing, instead of every author making it silently at the call
site.

**PKU574's message no longer contradicts any of this.** Every function it reports is
sessionless — that is how the population is selected, not a finding — yet it opened by
reporting that they "require neither a session", then advised adding scopes. It now names
them as sessionless and recommends only gates an anonymous caller can meet:
`permissions`, `auth: true`, `wireAddon({ auth: true })`, or dropping `expose: true`.
`permissionsInBody` is deliberately absent from that list: a diagnostic should not
advertise its own escape hatch.
