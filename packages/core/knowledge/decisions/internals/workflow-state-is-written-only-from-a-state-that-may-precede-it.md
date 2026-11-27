---
type: decision
title: Workflow state is written only from a state that may precede it
description: Run and step writes are compare-and-set in the store, so a writer acting on an old read is refused instead of undoing what happened since
tags: workflow, reliability
---

# Workflow state is written only from a state that may precede it

A pass reads a run, works, and writes. A cancel, another pass or a recovery sweep
can land between the two, and reading again just before the write only narrows
that window. So the store applies a write only when what it replaces may precede
it, and says whether it did.

## Runs

`transitionRunStatusImpl(id, from, status)` is the only run status write.
`updateRunStatus` takes its sources from `RUN_STATUS_SOURCES`. An unwind names its
own, because it is the one writer that may leave `compensating`, and only the
unwind of a cancel may leave `cancelled`: otherwise a step failing after a cancel
would rewrite why the run is unwinding.

A refused writer does not announce the outcome it did not write. It leaves the
parent to whoever did settle the run.

Each store makes the check and the write one operation: a `WHERE status IN` in
Kysely, a filtered update in MongoDB, a script in Redis. The in-memory service has
no await between the two. A Durable Object interleaves calls at every await, so it
runs its conditional writes one at a time.

**What this rules out:** a run status write that does not name its sources.
