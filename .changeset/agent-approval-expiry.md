---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/skills': patch
---

Agent approvals expire. A run suspended for an approval or a credential stamps `expiresAt` on each `PendingApproval`, from the agent's new `approvalTtlMs` (a finite number above zero; `addAgent` refuses anything else) or `DEFAULT_AGENT_APPROVAL_TTL_MS`, 10 minutes. `resumeAgent`, `resumeAgentSync` and `approveAgent` refuse an expired approval with a `GoneError` (410) before claiming it or calling the tool or the model, and fail the run with `errorMessage: 'approval expired'`; a delegating parent run fails with its sub-agent. Every store also refuses an expired approval in `resolveApproval`. An approval with no expiry, including any saved before this release, is refused.

`@pikku/kysely`: `agentToolCall` gains a nullable `approvalExpiresAt bigint` column; run `pikku db generate` then `pikku db migrate`. `KyselyAgentRunStateService` now reads its JSON columns through a serializing plugin (SQLite, D1), compares its claim as text so the compare-and-swap matches there, and creates run ids that fit the `varchar(36)` column on Postgres.
