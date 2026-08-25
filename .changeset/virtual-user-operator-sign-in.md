---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/better-auth': patch
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

A Fabric operator can now actually start the run it signs in to start.

`fabric()` granted its operator row `admin` and nothing else. `admin` is this
package's own root — pikku's parent-grant rule walks down from a root that is
held, and the virtual-user scaffold declares `virtualUser` as a root of its own
precisely so a role can carry `virtualUser:run` without also implying
administration. So the operator was refused by `runVirtualUser`, the one
function the operator sign-in exists to reach.

The operator is now granted the roots in `OPERATOR_SCOPE_ROOTS`
(`admin`, `virtualUser`) rather than a bare `admin`. Listed rather than
collapsed to `*`, which would make every operator a superuser on every app for
the sake of one function: an operator still holds nothing in the application's
own domain, and a root the app never declared is skipped rather than stored.

The grant is also re-checked on every operator sign-in instead of only when the
row is created. It is deliberately logged rather than thrown, so a single
failure used to leave that operator permanently unprivileged with nothing to
retry it, and a root added to the set later would never have reached the
operators that already existed.

The scaffolds no longer keep their logic inside the CLI's template strings.

Code written as text inside a template literal is never compiled, never linted,
and testable only by matching the source the CLI emits — so a dead branch or a
duplicated loop survives there indefinitely. Five scaffolds were carrying real
logic that way, and it now lives in `@pikku/core` alongside the types it uses,
leaving each serializer to emit only what is genuinely per-application.

- **virtual-user** — 677 lines: the run driver, the persona and disposition
  rules, the schedule writer and the serializers, now
  `@pikku/core/virtual-user`. The guarantee that an operator token never
  reaches the run record used to be a regex over emitted text; it is now
  structural, because `startVirtualUserRun` has no parameter to pass one to.
- **workflow** — the two status streams were an ~80-line poll loop each,
  identical apart from three fields, now one `streamWorkflowRunStatus` told
  whether to be detailed. Fixes a latent bug both copies shared: a
  `setInterval(async …)` whose poll threw produced an unhandled rejection and a
  stream that never closed.
- **emails** — ~190 lines of HTML escaping, trusted-root allowlist and
  single-pass substitution, now `renderEmail` in `@pikku/core/services`. This
  was the security-sensitive one.
- **agent** — both callers built the same options object; now
  `agentCallOptions`, typed against `AgentInput` rather than a second copy of
  its shape.
- **console** — two branches that could only survive uncompiled: a catch block
  identical to its try, and an if/else whose arms were the same call.

Behaviour is unchanged throughout, and the emitted modules are the same modules
— the emails scaffold's ten escaping tests pass untouched through core. The five
serializers shrink from 1,936 lines to 1,281, and what they used to emit is now
covered by 75 tests that run the code rather than by regexes over the text.
