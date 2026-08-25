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

The scheduled tick now runs as the platform user, and starts its runs through
the same door a person uses.

`startVirtualUserRun` is gone. It existed only so the tick could record a run
without holding a session, which meant the persona checks, the
production-disposition rule and the record lived in two places that would
eventually disagree. The tick calls `runVirtualUser` over RPC instead, and the
scaffold emits `virtualUserPlatformSession` to give it an identity:

```ts
wireScheduler({
  name: 'virtualUsers',
  schedule: '0 * * * *',
  middleware: [virtualUserPlatformSession],
  func: tickVirtualUserSchedules,
})
```

`pikku-platform` is the platform's own principal and already exists for exactly
this — a reserved user row created with no credential account of any kind, so no
sign-in method can resolve it, and one the user directory already filters out, so
unlike a seeded service account it costs no phantom member in any list, seat
count or bill.

The middleware is attached to the task rather than declared as tag middleware
over `/rpc`, which cannot set a session at all: `runScheduledTask` builds its
wire with a `sessionService`, so the session set here is the one the function is
frozen with. A tick wired without it is refused for want of a session, and one
carrying the wrong scope is refused on `virtualUser:run` — both now covered by
tests.
