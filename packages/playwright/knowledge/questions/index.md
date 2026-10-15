---
type: overview
title: Questions
description: Things asked of playwright and not yet answered
---

# Questions

Something asked and not yet answered. The choice stays, the doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Should the Playwright provider accept a project's own browser sign-in that sets no session cookie?](should-a-project-browser-sign-in-without-set-cookie-be-accepted.md) — The default browser sign-in requires a Set-Cookie, but a signIn the project passes in is awaited and never checked for a session cookie
- [Should logout clear more than cookies?](should-logout-clear-more-than-cookies.md) — VirtualUserSession.logout clears only the context's cookies, so other browser storage in the virtual user's context survives a logout
<!-- /pikku:knowledge-index -->
