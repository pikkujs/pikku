---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
---

`AgentRunStateService.resolveApproval` takes one claim object, `{ runId, toolCallId, status }` (`ApprovalClaim` from `@pikku/core/services`), and claims only an approval pending on that run. The two-argument form is removed. The stores used to claim by tool call id alone, and `resumeAgentSync` claimed whatever ids its caller sent, so a caller authorized for one run could claim and run another run's approved tool. `resumeAgentSync` now refuses an approval list naming a tool call that is not pending on the run, before claiming any of it. A custom store must add the run to its compare-and-swap; see `docs/MIGRATION.md`.
