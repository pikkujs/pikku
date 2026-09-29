---
'@pikku/cli': patch
---

A local CLI entrypoint now boots the services `pikku serve` does. Its generated bootstrap called the app's `createSingletonServices` with nothing injected, so a command run from it saw none of the database-backed agent, feature-flag, analytics, scope and webhook services, nor the in-memory queue, scheduler, trigger and workflow services a request to the dev server gets. Codegen now writes `pikku-local-services.gen.ts` beside `pikku-services.gen.ts`, with `createLocalServices(config, extras)` assembling that set, and the bootstrap hands its result to the factory as existing services.

The file opens the database itself — `DATABASE_URL`, else the config's `sqliteDb` / `postgresUrl`, else `.pikku-runtime/dev.db` for a project with sqlite migrations — through whichever of `@pikku/kysely-node-sqlite`, `@pikku/kysely-bun-sqlite` and `pg` the project declares, with the generated coercion map applied. What serve reads off the inspector as it starts (which services are required, the declared scopes and system roles) is baked in at codegen. `@pikku/kysely`, `@pikku/schedule` and `kysely` are added to the project's dependencies when a local entrypoint is configured.
