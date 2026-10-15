---
type: overview
title: Questions
description: Things asked of @pikku/better-auth and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated,
so the doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Does a failed delegated-login credential store leave the user and link behind on purpose?](a-failed-delegated-login-store-leaves-the-user-and-link.md) — The user row and the delegated account link are written before storeCredential; if the store throws, nothing removes them and the next sign-in reuses the link
- [Should getAuthSession read relayed cross-site cookies?](should-get-auth-session-read-relayed-cross-site-cookies.md) — getAuthSession merges relayed cross-site cookies into the headers it reads, a public read path that the cross-site cookie decision never names
- [Should the default session trust the stored active organization?](should-the-default-session-trust-the-stored-active-organization.md) — With no mapSession, orgId is copied from activeOrganizationId on the session row, and default-session.ts does not check that the user belongs to that organization
<!-- /pikku:knowledge-index -->
