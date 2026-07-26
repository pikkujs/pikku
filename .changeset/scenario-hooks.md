---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Add `before` / `after` hooks to `pikkuScenario`, and make an unextractable scenario a hard error.

A scenario config now takes `before` and `after`. Both have the same signature as `func` — `(services, data, wire)` — with the return value discarded, so there is no new type to learn and a hook reaches the app the same way the body does, through `wire.actors`:

```ts
export const credentialScenario = pikkuScenario({
  title: 'A credential is loaded on first use',
  tags: ['scenario', 'credential'],
  before: resetsCredentials,
  after: removesInstalledAddon,
  func: async (services, data, { scenario, actors }) => { ... },
})
```

- `before` throwing skips the body and fails the run, but `after` still runs.
- `after` always runs, in a `finally`. Throwing fails a run that would otherwise have passed; on an already-failed run it attaches as the `cause` and never replaces the original error.
- Neither runs when the run is suspended or waiting — teardown only fires at a terminal outcome.
- Hooks are not ladder rows: the runner records nothing for them, and a failure is labelled by phase via the new `ScenarioHookError`.
- Hooks are scenario-only. A `before`/`after` on a `pikkuWorkflowFunc` never runs — a workflow is durable and resumable, so a callback that reran on every replay would have no honest meaning.

Two fixes that scenarios needed to be safe to write:

- A closure in a complex-workflow or scenario body is no longer held to the DSL statement whitelist. A single `try`/`catch` inside any callback previously failed extraction, and the fallback path understands `do`/`sleep` but not `step`/`given`/`when`/`then` — so the scenario registered with **zero steps** and passed vacuously, with no diagnostic. Plain DSL workflows still descend into callbacks, which is what validates fanout bodies.
- New `PKU679`: a scenario that fails DSL extraction is now a critical error and refuses to register, instead of silently registering empty. A scenario that declares no input parameter at all is legitimate and still extracts.
