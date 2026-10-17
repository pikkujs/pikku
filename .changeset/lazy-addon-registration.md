---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
---

Cloudflare units register their addons' functions and schemas on first use instead of at Worker startup.

`pikku all --lazy-addons` splits each wired addon's published bootstrap: its meta is still imported statically, while `schemas/register.gen.js` and `function/pikku-functions.gen.js` move into an exported, memoised `loadAddons()` as dynamic imports. Per-unit deploy codegen passes the flag for a provider whose adapter sets the new `ProviderAdapter.lazyAddonRegistration`; the Cloudflare adapter does, and its worker entries await `loadAddons()` before building singleton services. Addons already published work unchanged — the split reads their existing bootstrap, and one it does not recognise is imported whole. Other runtimes and the server container keep the eager bootstrap.

On a synthetic addon the size of `@pikku/addon-github` (811 functions, 1416 schemas) module evaluation at startup fell from ~438ms to ~191ms and registers nothing until the first request.
