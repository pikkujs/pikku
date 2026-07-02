---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

user flows: actors move onto the workflow wire + `pikku userflow` command

- Actors are no longer a singleton service: `startWorkflow(..., { actors })`
  registers them per run and they arrive on the wire —
  `func: async ({ logger }, input, { workflow, actors })`.
- Inspector enforces user flows are pure remote stories (PKU673): a
  pikkuUserFlow func may only destructure `logger`/`config` from services.
- New `pikku userflow run <environment> [--flows a,b] [--tags x,y]` runs flows
  against `userFlows.environments` from pikku.config.json (secret from
  USER_FLOW_ACTOR_SECRET env), refusing internal (non-actor) steps so runs
  against staging/production never touch local services; non-zero exit on
  failure. `pikku userflow list` prints names, descriptions and tags.
- Workflow meta now carries `title` (parity with HTTP routes/functions).
