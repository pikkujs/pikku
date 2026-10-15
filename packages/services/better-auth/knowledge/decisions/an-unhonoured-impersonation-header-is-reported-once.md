---
type: decision
title: An impersonation header nobody honours is reported once
description: A request carrying the impersonation header to a middleware without the option logs one warning per process, because scenario runs send the header on every request
tags: better-auth, impersonation, logging
---

# An impersonation header nobody honours is reported once

Impersonation is opt-in, so a middleware registered without the `impersonation`
option ignores the header. Silence there is dangerous: a caller that names a
target user in that header, on an app that never passed the option, runs as the
user that signed in instead. The only symptom is assertions failing against data
the target should have seen.

`warnImpersonationUnconfigured` (`auth-session-impersonation.ts`) makes that
case loud. It logs a warning that names the header, the target and the fix. It
fires once per process (module-level `warnedUnconfigured`), because a client
that sends the header sends it on every request and the misconfiguration does not
change between them.

Both `betterAuthSession` and `betterAuthStatelessSession` call it. As written,
`betterAuthStoreSession` does not; see
[the store middleware question](../../../../core/knowledge/questions/does-the-store-session-match-the-other-two.md).

**What this rules out:** ignoring the header without any signal, and logging on
every request.
