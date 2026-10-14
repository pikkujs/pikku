---
type: overview
title: Decisions
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [A delayed RPC job carries the caller's session in its data, and a recurring job carries none](a-delayed-rpc-job-carries-the-callers-session-and-a-recurring-job-carries-none.md) — BullSchedulerService stores the session in the job data and returns it from getTask, while the recurring worker runs the task by name alone
<!-- /pikku:knowledge-index -->
