---
'@pikku/better-auth': patch
---

Let the actor gate take the opt-in from the caller, not only `process.env`.

`resolveActorSignIn()` read `PIKKU_ALLOW_ACTOR_SIGN_IN` off the environment and
nowhere else, which quietly excluded the runtime most stages deploy to. A
Cloudflare Worker has no populated `process.env`: bindings reach user code
through the variables service, and workerd mirrors them into `process.env` only
under `nodejs_compat_populate_process_env`, default for compatibility dates from
2025-04-01. A deployment that pushed the opt-in as a binding — the only shape a
Worker takes — therefore configured a stage whose gate could never see it, and
`/sign-in/actor` answered `Actor sign-in is disabled outside \`pikku dev\`` with
the value sitting right there on the script.

`pikkuActor` now accepts `allowSignIn`, and `resolveActorSignIn(optIn?)` prefers
it over the environment. Such a stage passes
`await variables.get(ACTOR_SIGN_IN_OPT_IN_ENV)`, beside the secret it already
reads there. Everything the gate decided before, it decides identically: only
`passwordless-actor-sign-in` opens it, any other value is a logged near miss
whose text still never reproduces what it was given, and provisioning stays a
separate power held by `pikku dev` alone.

The value is passed, never a boolean, and never baked in: what opens the gate
remains something the deployment set and an operator can read back out of it.
When a caller passes one, the environment is not consulted — a stage is opened by
its own configuration or not at all.
