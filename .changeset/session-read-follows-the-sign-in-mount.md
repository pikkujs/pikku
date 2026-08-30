---
'@pikku/core': patch
'@pikku/cli': patch
---

Read a persona's session back from the mount its sign-in path names.

`sessionRoles()` asked for `/auth/get-session` no matter where auth was
mounted. An app serving better-auth under `/api/auth` while keeping its RPCs at
the root cannot put the mount in `apiUrl`, so it moves `signInPath` — and the
session read stayed behind, 404'd, and returned `null`. `null` means "this
stage does not report roles", which turns the role check off: every
`pikku persona run` on such an app warned "running unverified" and lost the one
thing that tells a permissions finding from seed drift.

The default now follows `signInPath`, and `environments[].sessionPath` in
pikku.config.json overrides it for a stage that reports the session elsewhere.
