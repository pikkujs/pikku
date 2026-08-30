---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/playwright': patch
---

Derive a persona's session and operator paths from the mount its sign-in path names.

Both `sessionRoles()` and the Fabric operator handshake asked for a fixed
`/auth/…` no matter where auth was mounted. An app serving better-auth under
`/api/auth` while keeping its RPCs at the root cannot put the mount in
`apiUrl`, so it moves `signInPath` — and the other two stayed behind.

For the session read that meant a 404, which returns `null`, which means "this
stage does not report roles": every `pikku persona run` on such an app warned
"running unverified" and lost the one thing that tells a permissions finding
from seed drift. For the operator handshake it was worse — `HttpPersona`
reused the *actor* path verbatim, so an operator token was posted to the actor
endpoint and came back as a validation error about a missing email and secret,
which reads like a broken persona rather than a wrong URL. The browser provider
had the same fixed default.

All three now follow `signInPath`, and `environments[].sessionPath` in
pikku.config.json overrides the session read for a stage that reports it
elsewhere.
