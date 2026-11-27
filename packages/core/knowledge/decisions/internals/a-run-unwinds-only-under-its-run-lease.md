---
type: decision
title: A run unwinds only under its run lease
description: One driver compensates at a time; a caller that cannot take the lease leaves the unwind to the holder, which looks again once it lets go
tags: workflow, reliability
---

# A run unwinds only under its run lease

A cancel and the pass already working a run can both reach its unwind. A
compensation run in-process sits `running` with no step lease, so a second driver
reads it as lost and invokes it again. Every compensation is therefore driven
through `RunUnwinds.drive`, under the run lease. A lease is not re-entrant, so the
pass that already holds it says so instead of taking it again.

A cancel never waits for the lease. It writes the run's status without it and
leaves the invocations to whoever can take it. Three things bring an unwind back
when the lease is taken:

- the holding pass drives it before it ends, if it sees the cancel;
- `RunUnwinds.runPass` reads the status again after releasing, which covers a cancel
  that landed after the pass's last look, with or without a queue;
- where there is a queue, the refused caller also enqueues a wake, for a holder in
  another process.

The in-memory and Durable Object services pass the run lease through, so
`UnwindExclusion` keeps one driver per run inside a process. A caller that arrives
while one is active does not wait, because a compensation may itself call back
into the unwind. It asks the active driver to go round again.

A driver that loses the lease part way records nothing more, and
[the unwind is picked up again](a-pass-that-lost-its-lease-writes-nothing.md).

**What this rules out:** calling `driveUnwind` anywhere else.
