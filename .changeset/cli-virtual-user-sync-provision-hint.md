---
'@pikku/cli': patch
---

`pikku virtual-user sync` and its `--help` text now point at `provisionVirtualUsers` from `@pikku/better-auth`, the function that provisions virtual users in a deployment. They used to name `pikkuCloud`, which `@pikku/better-auth` does not export.
