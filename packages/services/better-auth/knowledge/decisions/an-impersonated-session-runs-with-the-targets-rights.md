---
type: decision
title: An impersonated session runs with the target's rights
description: Once impersonation resolves, scopes are fetched for the target user id, so the admin's own grants never carry over to the impersonated request
tags: better-auth, impersonation, scopes
---

# An impersonated session runs with the target's rights

When `resolveImpersonatedSession` returns a session, every middleware passes it
to `withResolvedScopes` (`auth-session-scopes.ts`), and that resolves scopes for
the session's `userId`, which is now the target. The code comment in
`auth-session.ts` says so directly: "an impersonated session runs as the target,
with the target's rights."

The admin's grants do not carry over. The gate that let the admin in is checked
against the admin's scopes, and that is the only place they count.

The session that comes back is shaped differently from a normal one. With no
`mapSession`, the impersonated session is just `{ userId: target }`
(`resolveImpersonatedSession`), so it does not get the `orgId` or `virtualUser` fields
a normal session would. Whether that is intended is recorded in
[questions](../../../../core/knowledge/questions/what-an-impersonated-session-carries.md).

**What this rules out:** resolving scopes from the admin's grants while
impersonating, and merging the admin's scopes into the target's session.
