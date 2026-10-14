---
type: overview
title: Questions
description: Things asked of the pg-boss scheduler and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should a delayed RPC run as the session captured when it was scheduled?](should-a-delayed-rpc-run-as-the-session-captured-at-scheduling.md) — scheduleRPC writes the caller's session into the pg-boss job payload, and getTask returns it; this file does not contain the consumer that runs the job
<!-- /pikku:knowledge-index -->
