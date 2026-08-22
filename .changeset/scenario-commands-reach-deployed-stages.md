---
'@pikku/cli': patch
'@pikku/playwright': patch
---

Point `pikku scenario run`, `pikku persona`, and `pikku persona sync` at a
deployed environment.

Each of the three read `SCENARIO_ACTOR_SECRET` directly and failed without it,
which meant a deployed target was unreachable no matter what credentials you
held. They now share one resolver: `FABRIC_OPERATOR_TOKEN` for a deployed stage,
`SCENARIO_ACTOR_SECRET` for a local `pikku dev` one, and an error naming both
when neither is set. The operator token wins when both are present, being the
stronger of the two.

Browser runs follow the same split. `@pikku/playwright` takes `operator` as an
alternative to `secret`, plants the operator session on the actor's context and
sets the impersonation header on it — so a browser step and an RPC step in one
scenario still act as one user.

Set `PIKKU_PERSONA_CREATE_MISSING=true` to let a run provision persona accounts
the target does not have. It is off by default.
