---
"@pikku/cli": patch
---

Default `servicesNotDestructured` and `wiresNotDestructured` lint rules to `'error'`

Both rules now fail the build without requiring explicit `pikku.config.json` configuration. Projects can still override to `'warn'` or `'off'` if needed.
