---
'@pikku/deploy': patch
---

A deploy build running under Bun no longer treats `ws`, `undici` or `bun:*` as Node built-ins. They were left out of the bundle and refused in a Worker, so a unit using `@cloudflare/puppeteer` failed to build.
