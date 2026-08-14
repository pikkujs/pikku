---
type: decision
title: Durability is only observable against a file
description: The harness stores workflow runs in memory by default, so SQLITE_PATH is what makes crash recovery testable at all
tags: workflows, chaos
---

# Durability is only observable against a file

`src/services.ts` builds the SQLite backend over `new Database(':memory:')`. That
is the right default for the standard suite — every run starts from an empty
store, and nothing leaks between scenarios.

It also means the harness cannot answer the one question a chaos test exists to
ask. Kill the server mid-run against an in-memory store and the run does not
survive to be recovered: `GET /workflow/:name/status/:runId` answers
`Run not found`. A framework that resumes correctly and one that drops the run
on the floor produce the identical observation, so the test proves nothing.

`SQLITE_PATH` points the same backend at a file. Set it, and an interrupted run
is still there after the restart — which is what turns "did it recover?" into a
question with two distinguishable answers.

**What this rules out:** treating a green chaos run against the default
configuration as evidence of durability. If `SQLITE_PATH` is unset, a
crash-recovery scenario is measuring the store, not the framework.

The same reasoning applies to side effects. A ledger held in a module-level map
is cleared by the very crash under test, so it reports "ran once" whether the
step ran once or twice. `chaos-ledger.ts` appends to a file for that reason.
