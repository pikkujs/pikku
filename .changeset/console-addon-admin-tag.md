---
'@pikku/cli': patch
---

Document how to gate the console addon's privileged surface.

The console addon (`@pikku/addon-console`) exposes privileged RPCs — credential
read/write, on-disk source editing, package install — with no authorization of
their own. Since tag-level permissions were removed in #972, a consuming app
gates the entire surface with a single package-scoped global permission:
`addGlobalPermission([checker], '@pikku/addon-console')`. Global permissions are
resolved in the callee's package namespace, so one registration covers every
console function at once. Apps that register none are unaffected (no globals =>
allow). The generated console `wireAddon` no longer emits a `console:admin` tag.
