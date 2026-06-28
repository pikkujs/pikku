---
'@pikku/cli': patch
---

Fix `pikkuBetterAuth` codegen fragility on cold bootstrap. The `#pikku` hub
re-exported `auth/auth.types.js` only after a full inspect, so a cold
`pikku bootstrap` followed by `pikku db generate` (or the first full inspect)
crashed importing the user's auth file with `does not provide an export named
'pikkuBetterAuth'`. Bootstrap now detects `pikkuBetterAuth(...)` via a cheap
AST-free source scan and pre-writes a stub `auth.types.ts` (raw re-export from
`@pikku/better-auth`) so the import resolves immediately; the typed wrapper still
overwrites it on the post-inspect pass.
