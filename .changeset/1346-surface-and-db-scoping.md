---
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/inspector': patch
---

The singleton intersection moves to the leaves that name it, the runtime stops
creating schema, and `db generate` writes only the runtime tables a project's
services own

`WiredSingletonServices` was exported from the generated function leaf so the
auth leaf could import it. Nothing outside a generated leaf ever names it —
emit declarations for a project of any size and it appears in none of them —
so the auth and middleware leaves derive the intersection themselves and the
function leaf keeps it private. `WiredServices` stays exported: 147 `.d.ts`
files name it, and unexporting it asks every wired module to name each member
service through a specifier it does not have.

`ensurePikkuSchema` is gone. `requirePikkuSchema` replaces it: a service calls
it at boot, it looks, and it issues no DDL at all. `pikku db generate` writes
the declaration down as a migration and `pikku db migrate` applies it, and
those two are now the only way pikku's runtime tables come into existence. A
service that finds them missing says so and stops, naming both commands.
Half-present is no longer a distinct case — the remedy is the same migration
either way. `audit` and `virtual-user` join `pikkuSchemas` as a consequence:
boot was the only thing that had ever created them.

`pikku db generate` applied all of `pikkuSchemas`, so a project with no agents,
no channels and no workflows still had `agent_threads`, `channels` and
`workflow_runs` written into its migrations, and then carried them forever. A
schema now names the services that own it, and generation gates on
`requiredServices` — the set the inspector already builds for service
tree-shaking. The gate is one-sided: a schema that names no owner is always
written, because the session and secret stores and the deployment record are
reached by the runtime itself and nothing in a project's source implies them.
Declared scopes now imply `scopeService`, which nothing destructures because
the generated auth layer is what reaches it.

Drift keeps asking the unscoped question. A table already in a database has to
stay recognisable as a runtime table after the service that needed it is
dropped — scoping it there would report those tables as unexplained.
