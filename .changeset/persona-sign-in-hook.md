---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

`wirePersonaSignIn(factory)` registers how personas sign in, once, in app code. The deployed app's generated `runVirtualUser`, `pikku persona run`, `pikku scenario run`, `pikku persona rpc` and the Playwright provider all pick it up. When it is set the operator token and the actor secret are never read, and combining it with `secret` or `operator` in `createHttpPersonas` is refused. `PersonaSignIn.headers` is now optional. The inspector records files that call it so the generated bootstrap imports them.
