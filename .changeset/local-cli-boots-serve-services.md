---
'@pikku/cli': patch
---

`pikku serve`, `pikku dev` and a local CLI entrypoint now boot an app on the same services, from one generated file. The local CLI's bootstrap used to call the app's `createSingletonServices` with nothing injected, so a command run from it saw none of the database-backed agent, feature-flag, analytics, scope and webhook services, nor the in-memory queue, scheduler, trigger and workflow services a request to the dev server gets.

Codegen now writes `pikku-local-services.gen.ts` beside `pikku-services.gen.ts` for every project. Its `createLocalServices(config, extras, options)` assembles that set. `pikku serve` and `pikku dev` load it from the project and pass in what only they have: the database they opened, their event hub, content store, scheduler and agent runner, and the requiredServices, scopes and system roles from a live inspector. The local CLI bootstrap hands its result to the app's factory as existing services.

The file imports only what the project has:

- A project with no database — no `db` config, no `db/sqlite` or `db/postgres`, and no kysely declared — imports from `@pikku/core` alone.
- A project with a database also imports `@pikku/kysely`, whose own copy of kysely it opens and types the database with.
- A project with a local CLI entrypoint also imports `@pikku/schedule`. It opens its own database: `DATABASE_URL`, else the config's `sqliteDb` / `postgresUrl`, else `.pikku-runtime/dev.db`. The driver is whichever of `@pikku/kysely-node-sqlite`, `@pikku/kysely-bun-sqlite` and `pg` the project declares, with the generated coercion map applied.

Codegen adds whichever of those packages the file imports to the project's dependencies.
