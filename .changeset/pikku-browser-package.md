---
'@pikku/browser': patch
---

Add `@pikku/browser` — a browser-automation service with a session API modeled on `@cloudflare/puppeteer` (`acquire`/`launch`/`connect`/`sessions`/`limits`) so one consumer code path reuses warm browsers identically on Cloudflare and locally. Ships `LocalBrowserService`, a Node fallback with an in-process keep-alive session pool. `puppeteer` is an optional peer dep, lazy-imported in `launch`, and pinned to the exact core (`22.13.1`) that `@cloudflare/puppeteer` vendors so `page.*` behaves identically both sides — a project that only runs on Cloudflare never needs it installed.
