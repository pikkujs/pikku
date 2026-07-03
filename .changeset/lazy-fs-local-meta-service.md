---
'@pikku/core': patch
---

LocalMetaService loads node:fs/promises lazily via process.getBuiltinModule so units that bundle it (e.g. agent units requiring metaService) pass Cloudflare upload validation instead of failing with `No such module "node:fs"`
