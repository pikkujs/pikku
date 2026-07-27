---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
---

Make the workflow service cheaper to run, and fix two ways it lost state.

The SQL workflow tables had no indexes at all, so every step read, every
history walk and every orchestrator tick was a sequential scan; five indexes
now cover the columns the engine actually queries by. A replay used to ask for
each step's row individually — O(N) reads per replay, O(N^2) over a run — and
now takes one read of the run's steps and serves the walk from it. A step
transition wrote the step row and its history row as two separate statements,
so a crash between them left a step saying `succeeded` whose history still said
`running`; both halves are now one transaction, and the history row is found by
attempt number rather than by sorting on `created_at`, which two attempts can
share. Resolving a dynamic workflow read and parsed every AI-generated workflow
in the deployment to `.find()` one by name; it is a point lookup now.

Waiting on a run no longer polls at a fixed interval. `pollIntervalMs` became a
ceiling rather than a cadence: polling starts at 10ms and widens towards it, so
a workflow that finishes in milliseconds is no longer held for a full second,
and a long-running one is not read at full rate for its whole life.

Two backend-specific defects: Redis kept a run's state as one JSON blob and
read-modified-wrote it, so parallel branches setting different variables
overwrote each other — state is a field per variable now, with the old blob
still read underneath so runs in flight keep what they had. Mongo's
`setStepScheduled` never wrote history, leaving a queued step reading as never
dispatched.

Also: dispatch no longer JSON round-trips every step payload before handing it
to a queue that serialises it anyway — the in-process dev queue, which is the
only one that was relying on it, does it itself now.

Two more defects. A transition whose step had no live attempt wrote its status
to the step row and silently nothing to history — the exact divergence the
transaction exists to prevent — and now repairs the step and writes the
missing row. And resolving a dynamic workflow was non-deterministic on all
three backends: a name can hold several active versions, and none of them
ordered the candidates, so which one ran could change between two calls
reading identical data. The newest version wins, with the graph hash breaking
a tie.

The two attempt columns and the five indexes are declared in the workflow
schema, so a fresh database gets them at boot. An existing one gets them from
a migration — `pikku db generate` writes the declaration down — rather than
from DDL issued at boot.
