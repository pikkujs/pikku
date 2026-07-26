---
'@pikku/kysely': minor
---

Declare the pikku runtime tables instead of creating them at boot.

The tables the runtime needs — workflow, AI, scopes, secrets, credentials, webhooks, channels, deployments, sessions — were created by `createTable(...).ifNotExists()` inside each service's `init()`. A table therefore existed if and only if some service happened to be constructed, in whatever order, with whatever schema qualifier that call site passed. In one deployment that produced a duplicate set of AI tables in `public` shadowing the intended ones in `app`.

`pikkuSchemas` is now the single declaration, exported from `@pikku/kysely`: the same kysely schema-builder chains, moved out of `init()` and never executed at boot. `applyPikkuSchemas` materializes them onto a database, `compilePikkuSchemas` renders them as SQL for a dialect, and both bind `CamelCasePlugin` themselves so a declaration always compiles to the physical names the rest of the package queries.

Auth is a declared prerequisite. `pikkuUserRole` and `pikkuUserScope` reference `user.id`, which Better Auth owns, so `scopeSchema` says so via `requires` and `applyPikkuSchemas` checks every prerequisite before creating anything — a project without auth gets a sentence naming what is missing and who owns it, not a foreign key error and not a half-applied database. `resolveRequirements` returns the same answer as data for callers that need to describe the gap rather than die on it.

That prerequisite also fixes a fourth disagreement: `user_id` was declared `text`, but Better Auth generates a `uuid` primary key on postgres, and postgres refuses a text column referencing it. The whole statement was rejected, so `KyselyScopeService.init()` had never actually created these tables on a postgres project — one had a migration written by hand with a comment explaining why. The column now takes its type from the column it references.

Three further disagreements the single declaration settled:

- `aiRun` was created by two services with different columns. `KyselyAIStorageService` omitted `pendingApprovals`; `KyselyAIRunStateService` declared it and read it back through `as any` casts. Whichever ran first decided the shape, and where the storage service won, resolving an approval failed. The column is declared.
- `workflowRuns`, `workflowStep` and `workflowStepHistory` defaulted their primary keys to `sql.raw("'" + crypto.randomUUID() + "'")`, evaluated once when the statement was built — one shared default for every row, not a generator. Dropped; the services supply the id.
- `workflowStep.fromStepName` was backfilled by an `alterTable(...).execute().catch(() => {})` bolted on after the fact. It is part of the declaration.

The services still create their tables in `init()`; this release only adds the declaration they will be derived from.
