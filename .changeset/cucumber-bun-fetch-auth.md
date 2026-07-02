---
'@pikku/cucumber': patch
---

BrowserWorld auth calls (signIn/ensureAccount/waitForServerReady) now use plain fetch + context.addCookies instead of Playwright's APIRequestContext, which crashes under bun (_parseSetCookieHeader gets a relative response URL → ERR_INVALID_URL on any Set-Cookie response)
