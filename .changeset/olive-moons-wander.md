---
'@pikku/cli': patch
---

Add the pikku-fabric-debug skill

`pikku-fabric` covers project layout, database, deploy provider and config, and
stops at deploy. Nothing covered debugging a stage that is already live, so an
agent facing a broken deployment had no supported path and would reach for
whatever it could improvise.

The new skill documents the actual loop over the existing commands —
`errors` (filtered, carries the traceId) → `trace <traceId>` (the whole request
across the stage, in order, with per-event durations) → `metrics` (is this one
request or the whole stage) → `logs` → `status` (is the running gitSha the one
you think it is).

It also records two behaviours that read as app bugs but are not:
`pikku fabric logs` accepts `--since` and `--deployment` and ignores both, and
`--follow` is a 2-second client-side poll rather than a server stream.
