---
'@pikku/cli': patch
---

A deploy unit now stubs a mapped library unless a service the unit requires claims it, even when the project never lists that service, so a platform services module that imports `@cloudflare/puppeteer` does not bundle it into units without a `browser` service.
