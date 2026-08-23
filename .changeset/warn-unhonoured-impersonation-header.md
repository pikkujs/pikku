---
'@pikku/better-auth': patch
---

Say so when a request carries `x-pikku-impersonate-user-id` and the session middleware was registered without an `impersonation` option.

The option is opt-in and omitting it was silent: the header was read by nobody and the request ran as the caller that signed in. A deployed stage's scenario and virtual-user runs sign in with a Fabric operator token and name the persona in that header, so an app that never passed the option ran every persona as the operator — a row with no membership anywhere — and the only symptom was assertions failing against data the persona should have been able to see.

Both `betterAuthSession` and `betterAuthStatelessSession` now warn once per process instead.
