---
type: decision
title: A virtual user cadence is a row, not a timer
description: How often a persona runs is stored as a due time per persona and acted on by a tick the project schedules — pikku never starts a timer, and a run never reschedules itself
tags: virtual-user, storage, scheduling
---

# A virtual user cadence is a row, not a timer

A run has a budget; a persona has a cadence. The two get confused because both
answer "how often", and neither answers the other's question: a budget caps one
outing, and raising it only buys a more tired user. What tells you about a
product is the same person coming back over a fortnight.

That cadence is one row per persona in `virtualUserSchedule`, holding
`nextRunAt`. `tickVirtualUserSchedules` acts on whichever rows are due. There is
no timer, no interval, and no in-memory loop.

**Not a timer**, because a process holding the next run in its own heap forgets
it on the next deploy, and the persona silently stops — with nothing anywhere
saying it used to run. The row survives restarts, and any instance can act on
it.

**Not reschedule-on-completion**, which is the tempting shape: finish a run,
draw a delay, schedule the next. It has exactly one failure mode and it is
fatal — a crash between the two ends the persona forever, and the evidence is an
absence. A due time written down before the run starts cannot be lost by the run
failing.

**Not a scaffolded cron.** The tick is generated as an ordinary function and
wired by nobody. A `wireScheduler` emitted by codegen would start spending an
application's model budget the moment somebody ran `pikku all`, on a host that
may not even run schedulers. One line in the project turns it on:

```ts
wireScheduler({ name: 'virtualUsers', schedule: '0 * * * *', func: tickVirtualUserSchedules })
```

Tick resolution bounds how *late* a due persona is, never how often it runs — a
persona due at 09:07 under an hourly tick starts at 10:00. Running the tick more
often costs one indexed query and changes no cadence.

Three rules make a tick safe to run at any resolution, from any number of
instances:

- **The due time is written before the run is dispatched**, so a tick that dies
  halfway cannot leave the row due for the next one to pick up again. A dispatch
  that throws therefore waits a full interval, which is the right way round: a
  persona failing to start should not be retried every minute for a week.
- **A persona whose previous run is still `running` is skipped, not queued.**
  Two copies of the same user acting at once is not a heavier test, it is a
  different one, and every finding it produces is unreproducible.
- **A run still `running` after `STALE_RUN_AFTER_MS` is failed and the persona
  runs again.** This is where the stranded-record cost of
  [a virtual user run being neither a workflow nor a queued job](a-virtual-user-run-is-not-a-workflow-and-not-a-queued-job.md)
  gets paid: without it, one restart mid-run would block that persona's schedule
  permanently.

The interval is a range (`minIntervalMs`, `maxIntervalMs`), drawn per run. A
user who arrives at exactly 09:00 every day exercises one cache state and one
cron neighbourhood; a real one does not keep an appointment.

**What this rules out:** a `setTimeout` or interval anywhere in the run path;
the engine scheduling its own next run; a scaffolded scheduled task; a queue
holding the next run; and a cadence that lives only in a config file, which
cannot record when the persona last actually went.
