---
type: decision
title: Leases are judged by the database's clock
description: A lock lease is written and compared in SQL against the server's own clock, stored as epoch milliseconds, so no worker's clock decides who holds anything
tags: [locks, workflows, kysely, clocks]
---

# Leases are judged by the database's clock

A lease is only as good as the clock that decides it has lapsed. When each
worker computed `new Date(Date.now() + ttl)` and compared against its own
`Date.now()`, a worker whose clock ran an hour fast saw every live lease as
expired and took it, and wrote leases that
outlived their ttl by the same hour for everyone else.

So the lease is computed in SQL: `expires_at` is set to _now + ttl_ and
compared against _now_, where _now_ is the database's —
`clock_timestamp()` on Postgres, `utc_timestamp(6)` on MySQL. There is one clock,
and every worker reads it. The columns are `bigint` epoch milliseconds rather
than `timestamp`, because the arithmetic then means the same thing in every
dialect and no driver gets to reinterpret a time zone.

On MySQL the epoch is counted from `utc_timestamp`, never
`unix_timestamp(now())`. `now()` is local to the session's time zone, and when
that zone falls back an hour, two real instants share one local time: the
epoch stood still for an hour, then jumped, so a dead holder's lease lived an
hour longer and every lease written in the repeated hour lapsed at once.

`PgKyselyLockService` and `MySQLKyselyLockService` override `nowMs()`;
`KyselyLockService` keeps the process clock, which is only correct when every process shares a host,
as they do on SQLite.

**What this rules out:** comparing a lease in JavaScript after reading it —
that check is exactly where a skewed worker decides wrongly.

**Testing it:** PGlite runs in-process and takes its clock from the JS
`Date.now`, so skewing `Date.now` skews the database too and a skew test on
PGlite proves nothing. The skew assertions live in
`verifiers/workflows/src/tests/lock-db.assert.ts`, against real Postgres and
MySQL servers.
