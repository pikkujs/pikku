---
type: decision
title: A dropped audit write is always logged
description: The no-op audit service falls back to the singleton logger when the wire carries none, so an unconfigured audit call is never silent
tags: services
---

# A dropped audit write is always logged

The no-op `AuditService` in `packages/core/src/services/audit-service.ts` is what
a function gets when it calls `audit.write()` without `audit: true` set on it.
Its `write` discards the event — but before it does, it warns once, and it looks
for a logger in two places: the wire's own, then the singleton passed to the
constructor.

The fallback is the point. `wire.logger` is an optional hook for a host that
wants invocation-scoped logging — core never sets it, so on every path core
itself drives, the singleton is the only source there is. With only
`this.wire.logger` the warning would be dropped every time.
An audit call that silently does nothing is the worst available outcome: the
function believes it is producing an audit trail, the trail does not exist, and
nothing anywhere says so. The warning names the function and the fix, and fires
once per instance so it cannot flood a hot path.

**What this rules out:** narrowing the logger lookup to a single source,
downgrading the warning to `debug`, or removing it as noise from a service whose
whole job is to do nothing. If this class stops warning, an unconfigured audit
call becomes undetectable.
