---
type: decision
title: Audit readers see account names because the trail is resolved through the server-side adapter
description: resolveAuditUsers reads user rows as the server, so anyone holding admin:audit:read is shown names, emails and the actor flag for the users in the trail
tags: admin, audit, auth
---

# Audit readers see account names because the trail is resolved through the server-side adapter

`resolveAuditUsers` (`packages/addon/pikku-admin/src/lib/resolve-audit-users.ts:39-43`)
turns the user ids on one page of the audit trail into names and emails. It takes
the `internalAdapter` from the server's own better-auth context
(`resolve-audit-users.ts:51`), not from the caller's session.

The comment gives the reason. `admin:audit:read` already grants "every recorded
action, and which user took it", so a reader who may see an id may see the name
behind it (`resolve-audit-users.ts:28-31`). Reading the adapter directly also
reaches actor rows, which the admin user list hides, so that a trail "that cannot
say an actor did it" is avoided (`resolve-audit-users.ts:31-34`).

The directory copies `name`, `email` and an `actor` flag for each id that has a
user row (`resolve-audit-users.ts:66-73`). An id with no row is left out and is
not an error (`resolve-audit-users.ts:36-38`), so the caller shows the id the
trail recorded.

Two functions pass their page of ids through this resolver:
`getAudits` (`packages/addon/pikku-admin/src/functions/get-audits.function.ts:58-63`)
and `getAuditFilters` (`packages/addon/pikku-admin/src/functions/get-audit-filters.function.ts:36-41`).
Both are gated by `admin:audit:read` (`get-audits.function.ts:45`,
`get-audit-filters.function.ts:31`).

**What this rules out:** resolving audit names through the caller's own session,
and resolving them from the admin user list, which would leave out scenario
actors.
