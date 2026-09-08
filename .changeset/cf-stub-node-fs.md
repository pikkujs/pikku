---
'@pikku/deploy-cloudflare': patch
---

Stub `node:fs` in Cloudflare worker bundles instead of leaving it external. Workers have no `node:fs` under any compatibility flag, so a bundle that imports it — as `@pikku/addon-console`'s management functions do — dies at upload with `No such module "node:fs"`. Listing the node builtins individually lets the existing stub plugin take it, the same way `pg`/`postgres` are already stubbed.
