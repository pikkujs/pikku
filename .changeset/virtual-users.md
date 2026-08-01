---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
---

Add virtual users: LLM-driven synthetic users that work a real stage in
character.

A scenario proves a path somebody thought of. A virtual user works the same
ground without the script — it signs in as a scenario actor over the app's own
auth, is handed the scenarios' BDD prose and the schema of every endpoint it may
reach, and decides for itself what to do. It asserts nothing; a run produces
findings, and their absence only ever means "not this time, not with this seed".

Declare one with `pikkuVirtualUser({ actor, disposition, goals })`. The config is
entirely literal, so unlike a feature there is no body to resolve at runtime:
the inspector reads it, the CLI writes `scenarios/virtual-users.gen.json`, and
`MetaService.getVirtualUsersMeta()` serves it. Listing, describing or running one
never loads the app.

**Dispositions are engine dials, not prose.** Each carries its own intent weights
(continue / suspend / resume / abandon), temperature, re-read and repeat rates,
and switches: `careless` puts things down and picks them up in the wrong order,
`newcomer` starts with no memory, `auditor` is never offered a mutation,
`adversarial` is shown the catalogue its grants do not cover — being offered a
call it should not be able to make is the test — while `grants` stays live as the
oracle, so a success outside them is authorization drift rather than a pass.

**Nothing is retrieved against.** The whole reachable catalogue goes into the
instructions (~8k tokens on a 430-RPC project, cached for the run), because a
ranking function would make the user only as adventurous as the ranking and lose
exactly the endpoints worth stumbling into. Schema first: an endpoint must be
described before it may be called.

**No money in core.** The engine counts steps, calls, mutations and tokens; what
they cost is the app's to decide through `stop(tally)`.

CLI: `pikku virtual-user list` and `pikku virtual-user run <environment> [name]`,
with flags overriding a declaration for reproduction (`--seed`, `--steps`,
`--disposition`). Console: a Virtual Users screen beside Scenarios, built out of
core's own derivation functions so it shows a run's actual inputs rather than a
second implementation of them.

`dev-ai-runner` now ships its own `@pikku/ai-vercel` and
`@ai-sdk/openai-compatible` instead of requiring them from the project. Behind a
proxy one openai-compatible provider answers for every prefix, so there was never
a per-vendor package worth making somebody install; the project's copies still
win when it has them, and both load from the same place or neither does.
