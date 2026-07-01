---
'@pikku/browser': minor
---

Add `@pikku/browser` — a browser-automation service with a session API modeled on `@cloudflare/puppeteer` (`acquire`/`launch`/`connect`/`sessions`/`limits`) so one consumer code path reuses warm browsers identically on Cloudflare and locally. Ships `LocalBrowserService`, a Node fallback with an in-process keep-alive session pool; puppeteer/playwright/`@browserbasehq/stagehand` are optional peer deps lazy-imported per method, so a project installs only the one it uses. Stagehand routes its LLM through `LITELLM_PROXY_URL`/`LITELLM_API_KEY`.
