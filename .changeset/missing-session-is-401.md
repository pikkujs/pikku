---
'@pikku/core': patch
---

Answer 401, not 403, when a function requires a session and no session exists.

`MissingSessionError` has been in the error table at 401 since forever and was never thrown — the runner threw `ForbiddenError('Authentication required')` instead, so "you are not signed in" and "you are signed in but not allowed" both came back 403. The two mean opposite things to a client: the first is worth retrying after re-authenticating, the second never is.

That made pikku's own recovery unreachable. `HttpPersona` re-logs-in once on a 401 mid-run, for exactly the case its comment describes — a long run outliving its session. Against a stage using `betterAuthStatelessSession`, the signed cookie cache expires on the app's `cookieCache.maxAge` (5 minutes is the common setting), and from that moment every RPC in the run failed with 403 "Authentication required" while the retry watched for a 401 that could never arrive. A 32-minute scenario run failed everything after its first five minutes.

Permission and scope denials are untouched and stay 403.
