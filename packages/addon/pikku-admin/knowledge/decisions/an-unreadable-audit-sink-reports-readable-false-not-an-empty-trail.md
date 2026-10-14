---
type: decision
title: An audit sink that cannot be read reports readable false, not an empty trail
description: getAudits returns readable false with no events when the configured sink has no query, so a write-only sink is never shown as "nothing happened"
tags: admin, audit
---

# An audit sink that cannot be read reports readable false, not an empty trail

`getAudits` (`packages/addon/pikku-admin/src/functions/get-audits.function.ts`)
returns a trail page only when the configured sink can be queried. When
`audit.query` is absent, it returns no events and `readable: false`
(`get-audits.function.ts:47-49`).

The output type documents the reason. A queue producer, or no sink at all, is
reported as unreadable, because "'nothing happened' and 'you cannot see what
happened' are very different answers to give someone auditing a system"
(`get-audits.function.ts:31-36`). The function description says the same
(`get-audits.function.ts:43`).

When the sink is readable, the function returns `readable: true` with the page and
its names (`get-audits.function.ts:58-63`). The function is gated by
`admin:audit:read` (`get-audits.function.ts:45`).

**What this rules out:** an empty trail as the answer for a sink that cannot be
read back.
