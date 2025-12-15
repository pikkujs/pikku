---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Move credential wiring to separate module and output directory

- Created new `@pikku/core/credential` module with `wireCredential`, `CoreCredential`, `CredentialMeta`, `CredentialsMeta`
- Removed credential types from `@pikku/core/forge-node`
- Updated inspector to use `credentials` state instead of `forgeCredentials`
- CLI now outputs package files to `.pikku/package/` directory instead of `.pikku/forge/`
- Renamed `wireForgeCredential` to `wireCredential`
