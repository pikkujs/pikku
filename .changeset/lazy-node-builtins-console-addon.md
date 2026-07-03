---
'@pikku/addon-console': patch
---

Load node:fs / node:fs/promises / node:child_process lazily via process.getBuiltinModule so console addon code inside Cloudflare deploy bundles passes upload validation (CF rejects static imports of these modules: `No such module "node:fs"`)
