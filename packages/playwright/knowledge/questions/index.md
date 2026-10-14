---
type: overview
title: Questions
description: Things asked of playwright and not yet answered
---

# Questions

Something asked and not yet answered. The choice stays, the doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Should the Playwright provider accept a wired sign-in plugin that sets no session cookie?](should-a-wired-sign-in-plugin-without-set-cookie-be-accepted.md) — The default and operator browser sign-in paths require a Set-Cookie, but the wired-plugin branch copies whatever cookies it recorded and never checks that any were set
- [Should logout clear more than cookies?](should-logout-clear-more-than-cookies.md) — ActorSession.logout clears only the context's cookies, so other browser storage in the actor's context survives a logout
<!-- /pikku:knowledge-index -->
