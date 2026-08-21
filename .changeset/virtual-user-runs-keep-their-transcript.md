---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cli': patch
---

feat(virtual-user): keep the transcript a run already produced

The engine returns `intents` and `steps` on every run — what the user set out
to do, and every turn it took getting there — and `VirtualUserRunOutcome` kept
neither. The record held counts and findings, so the one question anybody
actually asks of a completed run ("what did it *do*?") had no answer anywhere,
even though the answer had been computed and thrown away a moment earlier.

`VirtualUserRunOutcome` now carries both, and `VirtualUserRunStore` gains a
`steps(runId, options?)` read. Intents ride on the run record: there are a
handful of them and every read of the run wants them. Steps get their own
`virtualUserRunStep` table, because a run at a 500-step budget carries more
transcript than every other column together and `list()` would pay for it on
every row.

Three things the kysely store had to get right, all of them driver differences
rather than design:

- steps are inserted in chunks of 50, because a bare sqlite driver binds at
  most 999 variables per statement and ten columns times a 500-step budget is
  five thousand — an un-chunked insert fails on long runs, which are the
  interesting ones;
- `ok` is stored as 0 or 1, since a bare driver cannot bind a boolean at all
  and `SerializePlugin` is not installed everywhere;
- `response` is stored JSON-encoded, because a truncated API response usually
  starts with a brace and `SerializePlugin` would otherwise read it back as an
  object rather than the string the engine saw.

Completing a run that does not exist no longer writes steps: there is no
foreign key to refuse them and nothing would ever read or reap them.

**This adds a table to the `virtualUser` schema**, and the runtime creates
nothing: a database that already has `virtualUserRun` gets the store's own
refusal at startup until `pikku db generate` writes the migration and
`pikku db migrate` applies it. Landing it now costs nothing, because
`scaffold.virtualUser` is not yet switched on anywhere.
