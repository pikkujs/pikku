---
"@pikku/cli": patch
---

`pikku fabric validate` now warns when `.pikku/` is not listed in `.gitignore`. Generated codegen artifacts should never be committed as they bloat PRs and can cause stale-codegen issues.
