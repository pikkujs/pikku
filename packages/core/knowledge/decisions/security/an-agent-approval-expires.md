---
type: decision
title: An agent approval expires, and one with no expiry is refused
description: A suspended run's approvals carry expiresAt (agent approvalTtlMs, default 10 minutes); a late resume fails the run with a 410, and approvals saved before expiry existed are refused rather than given a fallback
tags: agent
---

# An agent approval expires, and one with no expiry is refused

A run suspended for an approval used to wait forever: anyone holding the run id
and the tool call id could approve a refund days later, against a world that had
moved on. Each `PendingApproval` now records `expiresAt`, stamped where the run
suspends (both suspend paths in `agent-runner.ts`, `handleApprovals` and
`handleCredentialRequests` in `agent-stream.ts`) from the agent's
`approvalTtlMs`, or `DEFAULT_AGENT_APPROVAL_TTL_MS` (10 minutes).

The check runs twice. The resume paths (`resumeAgent`, `resumeAgentSync`,
`approveAgent`) check after the owner and agent gates and before claiming, so an
expired resume calls neither the tool nor the model; they fail the run
(`errorMessage: 'approval expired'`, pending list cleared) and throw a
`GoneError`. A sub-agent's expiry fails the delegating parent too. The stores
also refuse an expired approval inside `resolveApproval`, so the window between
the check and the claim cannot be used.

**Fail-closed on a missing expiry.** An approval with no `expiresAt`, which
covers everything saved before this change, counts as expired. Falling back to
`updatedAt + TTL` was rejected: `updatedAt` moves on unrelated writes, and the
only runs it would rescue are ones suspended across an upgrade.

**No infinite TTL.** `addAgent` refuses an `approvalTtlMs` that is not a finite
number above zero, so the expiry cannot be switched off per agent.

**No sweeper.** No store has a scheduler hook, so cleanup is lazy: an expired run
is failed when someone tries to resume it. One nobody resumes stays `suspended`,
but it can never be claimed.

The Kysely tool-call store keeps the expiry as `approvalExpiresAt bigint` (epoch
milliseconds), the same convention as the workflow lease columns, because it
compares the same way on SQLite and Postgres; a NULL never compares greater, so
the SQL claim is fail-closed by itself.
