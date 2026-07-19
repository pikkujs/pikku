---
'@pikku/core': patch
---

Security + feature: bind AI agent thread/run ownership to the authenticated session and add `sessionScope: 'user' | 'org'` to agents. The owner key is now the trusted principal (`session.userId`, or `session.orgId` for org-scoped agents) composed with the client `resourceId` (`principal:resourceId`), so a client-supplied `resourceId` sub-partitions within the caller's own boundary but can never widen access to another user's or org's threads. Resolution is idempotent (safe for sub-agent recursion and resume); org scope with no session org is denied; sessionless `user` wirings fall back to the bare `resourceId`.
