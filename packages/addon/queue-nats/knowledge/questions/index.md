---
type: overview
title: Questions
description: Things asked of the NATS scheduler and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should a scheduled NATS RPC carry the caller's whole session?](should-a-scheduled-nats-rpc-carry-the-callers-whole-session.md) — scheduleRPC puts the full session into the scheduled message body, and getTask and getAllTasks return it to whoever lists the schedules
<!-- /pikku:knowledge-index -->
