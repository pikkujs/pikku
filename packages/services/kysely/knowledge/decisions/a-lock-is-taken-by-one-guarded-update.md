---
type: decision
title: A lock is taken by one guarded UPDATE
description: Acquire inserts the key's row already lapsed, takes it with a guarded UPDATE, and reads the row back, because that is the one shape that behaves the same on SQLite, Postgres and MySQL
tags: [locks, kysely, mysql]
---

# A lock is taken by one guarded UPDATE

`acquire` is three statements, in an order that looks roundabout:

1. insert the key's row with `token = 0, expires_at = 0` — already lapsed —
   ignoring a conflict;
2. `UPDATE` it to this holder where it is this holder's or has lapsed, raising
   `token` unless this holder is re-acquiring a live lease;
3. read the row back and answer whether this holder now has it.

The natural shape, `INSERT … ON CONFLICT DO UPDATE … WHERE`, does not exist on
MySQL, whose `ON DUPLICATE KEY UPDATE` has no guard. Inserting the row lapsed
means there is a single path to holding a key — the guarded update — whether the
key is new or not.

Two MySQL behaviours shape the rest. `SET` is evaluated left to right against
values already assigned in the same statement, so `token` is assigned before
`holder`: the re-acquire test has to see the previous holder. And MySQL reports
rows _changed_, not rows _matched_, so a holder re-acquiring with an unchanged
row would look like a loss; the row is read back instead of trusting the count.

**What this rules out:** a dialect-specific upsert per database, and deciding
the outcome from `numUpdatedRows`.
