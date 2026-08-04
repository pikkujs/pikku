---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cli': patch
---

Scaffold virtual user runs as RPCs, backed by a run store.

`pikku persona run` could already turn a declared persona loose on a running
stage, but only from a terminal, and the result only existed in that terminal's
output. There was no way for CI, a console, or a scheduled job to start a run —
and nothing kept what a run found, so this week's findings could not be compared
against last week's.

`scaffold.virtualUser` now generates two RPCs and the function behind them:

- `runVirtualUser({ persona, goals?, memory?, disposition?, budget?, seed? })
  -> { runId }`
- `getVirtualUserRun({ runId }) -> { status, findings, tally, memory, … }`

They are gated on separate scopes — `virtualUser:run` and `virtualUser:read` —
because an adversarial run's findings are working exploits carrying live ids,
which makes reading them the more sensitive of the two. Production refuses every
disposition but `accountable`, checked against the effective one so the
per-run override cannot smuggle another in.

**A run is not a workflow and not a queued job.** It explores, so no two
attempts take the same steps and there is nothing to replay; and the record
already carries the progress a queue would only be holding on the way to the
same place. `runVirtualUser` writes the record, dispatches without awaiting, and
returns the id. The cost is stated on the type: a restart mid-run strands a
record at `running`, so a run older than its budget window and still `running`
is dead rather than working.

`@pikku/core` gains `VirtualUserRunStore` (with `virtualUserRunStore` on
`CoreSingletonServices`), and `@pikku/kysely` ships
`KyselyVirtualUserRunStore`, which creates its own table on first use like the
audit sink — the runtime never needs it, so it arrives with the feature that
fills it rather than in every database.

Also in core: `prepareVirtualUserRun`, which derives the catalogue, intents,
scopes and reachable agents in one place. `pikku persona run` reads the
inspector state and the generated RPC reads `metaService`, and the two have to
agree — otherwise the same persona and seed explore a different API depending on
how the run was started. `personaScopes` moved here from the CLI for the same
reason and is still re-exported from its old home. `PRODUCTION_DISPOSITION` is
now exported from `@pikku/core/virtual-user`, which it should always have been.
