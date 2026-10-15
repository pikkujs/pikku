---
'@pikku/core': patch
'@pikku/jose': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

Virtual users sign themselves in. A scheduled run signs in from inside the app through a server-only Better Auth endpoint, then drives the app over HTTP with the cookie. Outside callers (`pikku dev`, `pikku scenario run`, `pikku virtual-user run` and `rpc`, `pikku pages screenshot --as`, the Playwright provider) present one signed, short-lived, single-use EdDSA statement, which the app checks against `VIRTUAL_USER_VERIFY_KEY`; `pikku dev` generates the key pair, and a deployed stage's deployer holds `VIRTUAL_USER_SIGNING_KEY`. `@pikku/jose` gains `JoseVirtualUserStatementVerifier` and `@pikku/better-auth` takes `verifyKey`. Removed with no aliases: the operator token and `OperatorSignIn`, derived per-virtual-user secrets, `SCENARIO_VIRTUAL_USER_SECRET`, `PIKKU_VIRTUAL_USER_SECRETS`, `pikku virtual-user secret`, and `wireVirtualUserSignIn`. In production neither sign-in endpoint is registered.
