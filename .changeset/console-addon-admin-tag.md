---
'@pikku/cli': patch
---

Emit a `console:admin` tag on the generated console `wireAddon`.

The console addon (`@pikku/addon-console`) exposes privileged RPCs — credential
read/write, on-disk source editing, package install — with no authorization of their
own. The generated `wireAddon` now carries `tags: ['console:admin']`, so a consuming
app can gate the entire privileged surface with a single
`addTagPermission('console:admin', [checker], '@pikku/addon-console')`. Backwards
compatible: a tag with no registered permission checker resolves to allow, so apps
that don't opt in are unaffected.
