---
'@pikku/core': patch
'@pikku/jose': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`VIRTUAL_USER_VERIFY_KEY` accepts a single key (unchanged) or a JSON list of `{ kid, publicKey }`, so a stage can hold more than one virtual user statement key. `pikkuVirtualUser({ verifyKey })` and `JoseVirtualUserStatementVerifier` take the same union; a statement naming a `kid` is checked against that key only (unknown `kid` rejected), one without a `kid` is tried against each key. New statements carry a `kid` (the RFC 7638 thumbprint, `okpThumbprint` in `@pikku/core/services`). A malformed verify key now stops the app at start-up rather than failing each sign-in. `signVirtualUserStatement` in the CLI is now async.
