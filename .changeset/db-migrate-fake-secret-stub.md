---
'@pikku/cli': patch
---

db migrate: stub secrets during Better Auth schema introspection. The drift check
loads the app's auth factory only to derive the table/column shape, so it no longer
requires the app's real secrets (e.g. `BETTER_AUTH_SECRET`) to be present in the
environment — a fake secret service resolves every key to a placeholder.
