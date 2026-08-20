---
'@pikku/cli': patch
'@pikku/kysely': patch
---

The singleton intersection moves to the leaves that name it, and `db generate`
writes only the runtime tables a project wires

`WiredSingletonServices` was exported from the generated function leaf so the
auth leaf could import it. Nothing outside a generated leaf ever names it —
emit declarations for a project of any size and it appears in none of them —
so the auth and middleware leaves derive the intersection themselves and the
function leaf keeps it private. `WiredServices` stays exported: 147 `.d.ts`
files name it, and unexporting it asks every wired module to name each member
service through a specifier it does not have.

`pikku db generate` applied all nine `pikkuSchemas`, so a project with no
agents, no channels and no workflows still had `agent_threads`, `channels` and
`workflow_runs` written into its migrations, and then carried them forever. A
schema now names the wiring that implies it. The gate is one-sided: a schema
that names no wiring is always written, because the session, secret and
credential stores and the deployment record are wired by the runtime itself and
nothing in a project's source implies them.

Drift keeps asking the unscoped question. A table already in a database has to
stay recognisable as a runtime table after the wiring that created it is
removed — scoping it there would report those tables as unexplained.
