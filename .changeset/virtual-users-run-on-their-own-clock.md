---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

feat(virtual-user): put each persona on its own clock

A budget says where one run stops. Nothing said how often a persona should use
the application, so in practice each one ran whenever somebody remembered — and
what actually tells you about a product is the same user coming back over a
fortnight.

Each persona now gets a row rather than a bigger budget. `virtualUserSchedule`
holds `enabled`, the disposition and goals to run with, an interval **range**,
and `nextRunAt`. `tickVirtualUserSchedules` acts on whichever rows are due:

```ts
wireScheduler({ name: 'virtualUsers', schedule: '0 * * * *', func: tickVirtualUserSchedules })
```

The tick is generated and wired by nobody, deliberately. A scaffolded
`wireScheduler` would start spending an application's model budget the moment
somebody ran `pikku all`, on a host that may not run schedulers at all. Tick
resolution bounds how late a due persona is, never how often it runs.

Three things it does that are easy to leave out:

- The next due time is written **before** the run is dispatched, so a tick that
  dies halfway cannot hand the same persona to the next one. A dispatch that
  throws waits a full interval instead of retrying every minute for a week.
  That write is a compare-and-set against the `nextRunAt` the tick read, so it
  is also how a tick *wins* the persona: two processes on the same cron see the
  same due row, and only the one whose claim lands dispatches.
- A persona whose previous run is still `running` is skipped, not queued. Two
  copies of the same user acting at once is a different test, and its findings
  do not reproduce.
- A run still `running` after two hours is failed. Without that, one restart
  mid-run blocks that persona's schedule permanently — which is where the
  stranded-record cost of not using a queue finally gets paid.

Reschedule-on-completion was the other candidate and is worse in exactly one
way, fatally: a crash between finishing and scheduling ends the persona forever,
and the evidence is an absence.

New: `VirtualUserScheduleStore` in core (with the tick, `isDue` and `nextRunAt`
as pure functions), `KyselyVirtualUserScheduleStore` and its own schema —
its own rather than a third table in `virtualUserSchema`, and owned by its own
store, so a project that records runs and never wants them unattended carries no
cadence table. `scaffold.virtualUser` gains `setVirtualUserSchedule`,
`listVirtualUserSchedules` and the tick, behind a new `virtualUser:schedule`
scope: starting a run spends money once with a caller watching, while writing a
schedule spends it repeatedly with nobody there.

The console's Virtual Users screen gains a **Run now** button beside a persona's
run history, gated on `pikku:console:virtualUsers:run`. It dispatches the
project's own `runVirtualUser` rather than starting a run itself, so a run the
application would refuse — an acted-upon persona, a non-accountable disposition
in production — is still refused.
