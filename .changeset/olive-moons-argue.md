---
'@pikku/kysely': patch
---

Declare the pikku runtime tables instead of creating them at boot.

The tables the runtime needs — workflow, AI, scopes, secrets, credentials, webhooks, channels, deployments, sessions — were created by `createTable(...).ifNotExists()` inside each service's `init()`. A table therefore existed if and only if some service happened to be constructed, in whatever order, with whatever schema qualifier that call site passed. In one deployment that produced a duplicate set of AI tables in `public` shadowing the intended ones in `app`.

`pikkuSchemas` is now the single declaration, exported from `@pikku/kysely`: the same kysely schema-builder chains, moved out of `init()` and never executed at boot. `applyPikkuSchemas` materializes them onto a database, `compilePikkuSchemas` renders them as SQL for a dialect, and both bind `CamelCasePlugin` themselves so a declaration always compiles to the physical names the rest of the package queries.

`applyPikkuSchemas` runs its statements in one transaction, so the promise it makes about a half-applied database holds for the failures the prerequisite check cannot foresee too — a statement colliding with a table something else already created rolls back the ones that ran before it.

Auth is a declared prerequisite. `pikkuUserRole` and `pikkuUserScope` reference `user.id`, which Better Auth owns, so `scopeSchema` says so via `requires` and `applyPikkuSchemas` checks every prerequisite before creating anything — a project without auth gets a sentence naming what is missing and who owns it, not a foreign key error and not a half-applied database. `resolveRequirements` returns the same answer as data for callers that need to describe the gap rather than die on it.

That prerequisite also fixes a fourth disagreement: `user_id` was declared `text`, but `user.id` has no fixed type — Better Auth decides it from config, giving `uuid` under `generateId: 'uuid'` and an identity `integer` under `'serial'`, and postgres refuses a `text` column referencing either. The whole statement was rejected, so `KyselyScopeService.init()` had never actually created these tables on such a project — one had a migration written by hand with a comment explaining why. The column now takes its type from the column it references, whatever that turns out to be.

Three further disagreements the single declaration settled:

- `aiRun` was created by two services with different columns. `KyselyAIStorageService` omitted `pendingApprovals`; `KyselyAIRunStateService` declared it and read it back through `as any` casts. Whichever ran first decided the shape, and where the storage service won, resolving an approval failed. The column is declared.
- `workflowRuns`, `workflowStep` and `workflowStepHistory` defaulted their primary keys to `sql.raw("'" + crypto.randomUUID() + "'")`, evaluated once when the statement was built — one shared default for every row, not a generator. Dropped; the services supply the id.
- `workflowStep.fromStepName` was backfilled by an `alterTable(...).execute().catch(() => {})` bolted on after the fact. It is part of the declaration.

Every service's `init()` now goes through `ensurePikkuSchema`, which looks before it creates: all the tables present is a no-op, none present creates them from the declaration, and some present throws rather than filling in the rest. That last case is the point. `.ifNotExists()` turned every failure into a silent success — it is why nobody noticed the `user_id` type had been rejected since the day it was written — and a schema half-owned by a migration and half by a boot-time create is the condition all of this exists to end. Around 615 lines of duplicated DDL went with it.

Creating at boot is now the fallback rather than the intent: run `pikku db generate` and `init()` takes the `present` path and issues no DDL at all.

`KyselyPikkuDB` stays hand-written, because it carries what introspection cannot recover — `WorkflowStatus` rather than `string`, `Generated<Date>` rather than `Date`. A test materializes the declaration and asserts the two agree on every table and column, which is the drift protection generating it would have bought. It found one on its first run: `ai_run.pending_approvals` was in the DDL and in `KyselyAIRunStateService`, but not in `AIRunTable` — the reason that service read it back through `as any`. Declared, and the casts are gone.
