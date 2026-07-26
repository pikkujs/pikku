---
'@pikku/kysely': minor
---

Declare the pikku runtime tables instead of creating them at boot.

The tables the runtime needs — workflow, AI, scopes, secrets, credentials, webhooks, channels, deployments, sessions — were created by `createTable(...).ifNotExists()` inside each service's `init()`. A table therefore existed if and only if some service happened to be constructed, in whatever order, with whatever schema qualifier that call site passed. In one deployment that produced a duplicate set of AI tables in `public` shadowing the intended ones in `app`.

`pikkuSchemas` is now the single declaration, exported from `@pikku/kysely`: the same kysely schema-builder chains, moved out of `init()` and never executed at boot. `applyPikkuSchemas` materializes them onto a database, `compilePikkuSchemas` renders them as SQL for a dialect, and both bind `CamelCasePlugin` themselves so a declaration always compiles to the physical names the rest of the package queries.

Three disagreements the single declaration settled:

- `aiRun` was created by two services with different columns. `KyselyAIStorageService` omitted `pendingApprovals`; `KyselyAIRunStateService` declared it and read it back through `as any` casts. Whichever ran first decided the shape, and where the storage service won, resolving an approval failed. The column is declared.
- `workflowRuns`, `workflowStep` and `workflowStepHistory` defaulted their primary keys to `sql.raw("'" + crypto.randomUUID() + "'")`, evaluated once when the statement was built — one shared default for every row, not a generator. Dropped; the services supply the id.
- `workflowStep.fromStepName` was backfilled by an `alterTable(...).execute().catch(() => {})` bolted on after the fact. It is part of the declaration.

The services still create their tables in `init()`; this release only adds the declaration they will be derived from.
