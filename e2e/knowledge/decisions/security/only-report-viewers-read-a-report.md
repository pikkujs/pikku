---
type: decision
title: Only report-viewers read a report
description: The scope gate is the only way in, and no role or admin grant substitutes for it
tags: scopes
resource: func:getReport, scope:reports:read, scope:admin:impersonate
---

# Only report-viewers read a report

`getReport` declares `scopes: ['reports:read']`. That is an AND gate resolved
from the session at the boundary, before the body is parsed, so nothing inside
the function can loosen it.

**What this rules out:** an admin reading the report because they are an admin.
The `admin` scopes this project grants reach impersonation and the user
directory; none of them reaches `reports:read`. Scopes narrow, never widen — no
passing permission and no role hierarchy substitutes for a declared scope.

That is why the seed grants `reports:read` to `guest` and withholds it from
`admin`: it makes the admin the _authenticated-but-unscoped_ caller, which is
the only caller that proves the gate is a gate rather than an authentication
check.

Proved by [read a report](../../slices/01-read-a-report.md).
