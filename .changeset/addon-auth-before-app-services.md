---
'@pikku/core': patch
---

An addon no longer loses `auth` for the life of the process when a job reaches it while the app's services factory is still running. An app factory that publishes its services and starts queue consumers before returning let a job build the addon's services from a parent the generated `pikkuServices` wrapper had not yet given `auth`, and the addon services cache kept that copy, so every later `services.auth()` in the addon threw `auth is not a function`. When the parent has no `auth` and an auth factory is registered, the addon now gets an `auth` that resolves the app's own `auth` when it is called.
