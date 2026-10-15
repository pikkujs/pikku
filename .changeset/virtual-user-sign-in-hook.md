---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

`wireVirtualUserSignIn(factory)` registers how virtual users sign in, once, in app code. The deployed app's generated `runVirtualUser`, `pikku virtual-user run`, `pikku scenario run`, `pikku virtual-user rpc` and the Playwright provider all pick it up. When it is set the operator token and the virtual user secret are never read, and combining it with `secret` or `operator` in `createHttpVirtualUsers` is refused. `VirtualUserSignIn.headers` is now optional. The inspector records files that call it so the generated bootstrap imports them. The scenario cookie jar moved to `services`, and `createCookieJar` is exported from `@pikku/core/virtual-user`.
