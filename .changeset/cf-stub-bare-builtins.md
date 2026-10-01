---
'@pikku/deploy-cloudflare': patch
---

Stub `fs`, `fs/promises` and `child_process` whether they are imported bare or with the `node:` prefix. The stub patterns only matched the prefixed form, so a dependency importing bare `fs` (such as `@pikku/core/services/temporary-file-service`) was aliased to `node:fs` after the stub check and failed every unit bundle with `Could not resolve "node:fs" (originally "fs")`.
