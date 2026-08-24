---
'@pikku/better-auth': patch
---

Actor sign-in gates on which command is running, not on whether a secret happens
to be set

`actor()` decided whether to work by asking "is a secret configured". That
question is wrong in both directions, and both directions cost something real.

In development it charges every contributor a hand-managed `SCENARIO_ACTOR_SECRET`
for a server that is never production, and when they skip it the frontend renders
no quick-login control — a state indistinguishable from "no personas declared" or
"persona metadata unreadable". A consumer app ended up baking a `VITE_DEV_ACTOR_SOURCE`
marker into its bundle purely to tell those three apart from outside the
container, which is a diagnostic that only exists because the gate swallowed its
own reason.

In production it does the opposite. A `SCENARIO_ACTOR_SECRET` that reached a
deployed environment — an inherited `.env`, an image built from a dev shell —
silently enabled passwordless sign-in as any declared persona, provisioning
having granted those personas their real roles. Nothing said so.

So the gate now reads `PIKKU_DEV_ACTOR_SIGN_IN`, a positive marker `pikku dev`
sets on its own process. It is deliberately not `NODE_ENV`. `NODE_ENV` is written
by bundlers, test runners and process managers, and it is simply absent in plenty
of real deployments, so `NODE_ENV !== 'production'` fails **open** in exactly the
environments where being wrong is expensive. A marker fails closed: only the dev
command sets it, and its absence is the answer everywhere else.

Scenario and e2e suites do legitimately sign actors in against a deployed stage,
so a hard "dev only" rule would have deleted the scenarios feature rather than
secured it. One escape hatch, deliberately worded:
`PIKKU_ALLOW_ACTOR_SIGN_IN=passwordless-actor-sign-in`. The accepted value is a
sentence rather than `true` so the hatch cannot be reached by habit, and any
other value is ignored _and_ warned about, naming the literal that would have
worked — a near miss means somebody meant to enable this and believes they did.

There is deliberately no build-time equivalent. A `allowOutsideDev` option would
be compiled into the bundle, so nothing about a running deployment would tell you
whether its actor endpoint is open, and `pikku serve` could clear a marker but
never a constant. An env var is the auditable form: greppable across
deployments, visible where the deployment is configured, and clearable.

**Signing in and provisioning are now separate powers.** Creating an
`actor: true` row for an address that has none requires `pikku dev`
specifically; the opt-in permits authentication only, refusing an unknown
address with `No actor account exists for that address`. So a stage that must
run scenarios can be signed into as the personas provisioned there without also
becoming a place where anyone holding the secret can mint identities. The
endpoint was the only thing that created actor rows, so the deployment now
writes them itself at boot through `provisionPersonas` — see its own changeset.

Nothing here fails quietly. An open gate logs which branch opened it. A shut gate
with a secret wired to it warns, because that is a misconfiguration rather than a
no-op — at wiring time for a plain-string secret, and on the first refused request
for a lazy one, since resolving a lazy secret at boot would mean a vault round-trip
for a value the process may never need. A refusal returns
`Actor sign-in is disabled outside \`pikku dev\``, distinct from the existing
`Actor sign-in is not configured`, so a caller can tell "this stage does not run
scenarios" from "this stage meant to and lost its secret".

The `user.actor` column is still declared when the gate is shut. A schema that
differs between development and production would be a worse failure than the one
being closed.
