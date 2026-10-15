---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

`VirtualUserSignIn.headers` is now optional, the scenario cookie jar moved to `services`, and `createCookieJar` is exported from `@pikku/core/virtual-user`. The deployed app's generated `runVirtualUser`, `pikku virtual-user run`, `pikku scenario run`, `pikku virtual-user rpc` and the Playwright provider all share one `VirtualUserSignIn`.
