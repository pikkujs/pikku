---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/addon-admin': patch
'@pikku/addon-graph': patch
'@pikku/n8n-import': patch
'@pikku/skills': patch
---

Split the addon leaf so an application cannot shadow a linked addon's own

An addon authored its services through `#pikku/addon`, and so did an
application installing one. Node keeps those apart — `#pikku/*` is a
package-private subpath import, resolved against the addon's own
`package.json` — but tsconfig `paths` are global to a tsx process, and every
runtime template maps `#pikku/*` onto a sibling package. A linked addon's
`#pikku/addon` was resolved against the *application's* leaf, which holds the
install half and none of the authoring exports, and every template failed to
boot with `does not provide an export named 'pikkuAddonServices'`.

The authoring half now sits at `#pikku/addon/setup`. An application generates a
flat `.pikku/<leaf>`, so there is nothing there for that specifier to match and
the resolver falls back to Node, which reads the addon's own imports. Addons
declaring themselves import `pikkuAddonConfig`, `pikkuAddonServices` and
`pikkuAddonWireServices` from `#pikku/addon/setup`; `wireAddon` and
`wireRemoteAddon` stay at `#pikku/addon`.

`wireAddon` and `wireRemoteAddon` also move off `@pikku/core/rpc` onto
`@pikku/core/addon`. Being reached over rpc is how an addon is called rather
than what it is, and it put the whole addon surface behind the rpc subpath for
consumers that only wanted to install one.
