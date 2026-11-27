---
type: decision
title: Each workflow store reads the latest write
description: A cancel and a step start see each other only if the store reads its latest committed write, so what each store needs for that is stated here
tags: workflow, reliability
---

# Each workflow store reads the latest write

No lock is held while a step runs. A canceller commits the run and then reads the
steps; whatever starts a step commits it as running and then reads the run
(`startStepAttempt`, `claimStepForExecution` followed by the queued step's read of
the run). That excludes a step starting unseen only if each of those reads returns
the latest committed write.

- **MongoDB.** Every workflow collection is opened with `readPreference: primary`
  and `writeConcern: majority`, over whatever the database or connection string
  says (`WORKFLOW_STATE_OPTIONS`). This does not cover a failover. Reads keep
  the read concern the database or connection string gives, by default `local`,
  so a deposed primary that has not yet stepped down can still serve them, without
  the writes the new primary has accepted. A cancel committed there can go unseen
  by a step starting against the old one.
- **Kysely.** The service cannot choose where a query goes. It must be given a
  connection to the primary: not a read replica, and not a pooler or driver that
  sends reads to one.
- **Redis.** The client must read from the primary (no `readOnly` or
  `scaleReads` to replicas). Redis replicates asynchronously, so a failover can
  lose a write that was acknowledged; how far is a matter of the server's
  persistence and replication settings.
- **Durable Object.** Its storage is strongly consistent, and a run's state lives
  in one object.
- **In-memory.** One process, one copy.
