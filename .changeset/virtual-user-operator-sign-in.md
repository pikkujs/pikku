---
'@pikku/core': patch
'@pikku/cli': patch
---

Let a virtual user run against a deployed stage.

Until now the scaffolded run could only sign its personas in with
`SCENARIO_ACTOR_SECRET`, which only `pikku dev` serves — so a run against a
deployed target failed before its first turn. `runVirtualUser` now takes an
optional short-lived Fabric operator token, handed in by whoever starts the run
and passed through to `createPersonas` as `operator`.

Handed in rather than fetched on demand: a stage that could ask for a token
would be holding a credential able to mint admin sessions for itself for as long
as the box lives. It holds one receipt, for one run, and the receipt expires. It
is never written to the run record — only `FABRIC_OPERATOR_TOKEN` in the
environment is read, and only as the fallback for a run nobody handed a token to.

`HttpPersonasConfig.signInPath` now applies to the operator path too, so an app
that mounts auth under `/api` can say so once.

The framework's own virtual-user RPCs no longer enter a virtual user's
catalogue. A persona whose role carries `virtualUser:*` could otherwise start
further runs, read back every run's transcript — an adversarial run's steps are
working exploits against the same app — and put a persona on a schedule that
outlives it.
