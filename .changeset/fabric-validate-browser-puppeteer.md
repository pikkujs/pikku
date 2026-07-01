---
'@pikku/cli': patch
---

`pikku fabric validate`: when a workspace package depends on `@pikku/browser`, verify its `puppeteer` pin matches the version `@pikku/browser` requires (the exact core `@cloudflare/puppeteer` vendors) — error on a mismatch (local rendering would diverge from Cloudflare Browser Rendering), warn when `puppeteer` is absent entirely.
