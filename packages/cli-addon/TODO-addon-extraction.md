# CLI Addon Extraction — Follow-up Work

Tracking proper fixes to apply after the initial `@pikku/cli-addon` extraction landed.

## 1. Decouple addon from its consumer-facing namespace

**Current hack:** `cli-addon/src/functions/commands/all.ts` hard-codes `'cli:allWorkflow'` in `runToCompletion(...)`. This works because the only known consumer (`@pikku/cli`) registers the addon via `wireAddon({ name: 'cli', ... })`. Any consumer that names the addon differently (e.g. `fabric`) would break.

**Why the bare name broke:** when `all.ts` lived in `@pikku/cli`, its workflows registered in `pikkuState(null, 'workflows', 'meta')` (root). After extraction they register under `pikkuState('@pikku/cli-addon', 'workflows', 'meta')`. `resolveWorkflowMeta` in `packages/core/src/wirings/workflow/pikku-workflow-service.ts:15-42` only finds bare names in root, and namespaced names via the `name:localName` format where `name` must match a registered `wireAddon` `name`. An addon has no way to know its own consumer-defined namespace at code-write time.

**Proper fix — option A (preferred):** pass the calling package name into `resolveWorkflowMeta`. The RPC service / function-runner context already knows which package the calling function belongs to (via `pikkuState(packageName, ...)` keys). Plumb that into the workflow service call path so a bare `runToCompletion('allWorkflow')` from inside an addon first looks in that addon's own package meta, then root.

**Proper fix — option B:** extend `resolveWorkflowMeta` to fall back — if bare name misses root, iterate registered addon packages (`pikkuState(null, 'addons', 'packages')`) and search each. Ambiguous if two addons register the same workflow name; would need a conflict-resolution strategy.

**Until fixed:** every workflow `runToCompletion` / `startWorkflow` call inside cli-addon must use the `'cli:...'` prefix. That also means the addon only works when registered as `name: 'cli'`.

### 1b. Follow-up after the namespace fix: `WorkflowRunNotFoundError`

After changing `'allWorkflow'` → `'cli:allWorkflow'`, workflow *meta* resolves correctly:
- DSL path at `packages/core/src/wirings/workflow/pikku-workflow-service.ts:678` uses `pikkuState(packageName, 'workflows', 'registrations')` with `packageName = '@pikku/cli-addon'` — registration is found
- `createRun` is called with `name = 'cli:allWorkflow'` and returns a runId

But the polling loop then throws `WorkflowRunNotFoundError` at `pikku-workflow-service.ts:746-748`. `InMemoryWorkflowService.runs` is a plain instance-local `Map<string, WorkflowRun>` (see `packages/core/src/services/in-memory-workflow-service.ts:40`), so it's NOT a namespace issue on the run side. Suspects:

1. **Two workflow service instances in play.** cli's `createSingletonServices` creates an `InMemoryWorkflowService`, but the addon's hydration path may be producing a second one somewhere (e.g. the `pikku-package.gen.ts` factories wrap services in a way that re-instantiates). Check whether `services.workflowService` inside the addon's `all` function is the same object identity as cli's original.
2. **Run is deleted before polling.** `startWorkflow` runs the job inline (`shouldInline` is true when no queueService). If the inline `runWorkflowJob` throws or completes and a cleanup path deletes the run before the loop polls, getRun returns null.
3. **Inline execution path writes to a different service instance** (related to #1).

Concrete next step: add a `console.log` in cli-addon's `all.ts` to verify the service identity, and/or log `this.runs.size` before and after `createRun` + around `getRun` to see whether the run is stored and then cleared vs never stored. Once the two instances or the cleanup spot is identified, real fix follows.

## 2. CLI command `ref()` typing — FlattenedRPCMap drops addon entries

**Symptom:** `src/cli.commands.ts` errors like:
```
Argument of type '"cli:pikkuInfoFunctions"' is not assignable to parameter of type '"remoteRPCHandler"'.
Object literal may only specify known properties, and 'limit' does not exist in type '{ rpcName?: ..., data?: ... }'
```

`ref<Name extends keyof FlattenedRPCMap>` in `cli/.pikku/function/pikku-function-types.gen.ts` narrows `Name` to keys of `FlattenedRPCMap`. cli's generated `FlattenedRPCMap` shows only `'remoteRPCHandler'` even though it imports `CliRPCMap` from `@pikku/cli-addon/.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js`. Either the import resolves to an empty/missing type (addon RPC map `.d.ts` not published cleanly) or the `PrefixKeys` utility isn't applied on top of it.

**Action:** verify `@pikku/cli-addon/dist/.pikku/rpc/pikku-rpc-wirings-map.internal.gen.d.ts` exists and exports a non-empty `RPCMap`. Confirm cli's generated `FlattenedRPCMap` actually merges it with the `cli:`-prefixed form. Likely fix is either in cli-addon's build (ensure .d.ts is copied to dist) or in cli's type codegen (ensure PrefixKeys runs on imported addon maps).

Options check-in result at time of extraction: `dist/.pikku/rpc/` had the meta files but initially missed the `pikku-rpc-wirings-map.internal.gen.d.ts`. The `cp -r .pikku dist/` in build fixes presence, but typing still fails — might be a second issue (empty `RPCMap` generated).

## 3. Addon Config type mismatch in `pikku-package.gen.ts`

**Symptom:**
```
.pikku/addon/pikku-package.gen.ts(11,3): error TS2322:
  Type '(config: Config, existingServices?: Partial<SingletonServices>) => Promise<RequiredSingletonServices>'
  is not assignable to type 'CreateSingletonServices<{ logLevel?: LogLevel, secrets?: {}, workflow?: WorkflowServiceConfig }, ...>'
```

The generated `pikku-package.gen.ts` expects `CreateSingletonServices` typed with a **small** Config (just `logLevel/secrets/workflow`), but the addon's local `Config` extends `CoreConfig<PikkuCLIConfig>` with 80+ properties. Mismatch between:
- The addon-local `Config` type (cli-addon inherits the full CLI-specific Config because `application-types.d.ts` was copied over wholesale)
- The "default" `Config` the generated package shim assumes

**Proper fix:** cli-addon should have its own minimal `Config` / `SingletonServices` types that reflect what the addon actually requires. It inherited cli's heavy types wholesale during extraction. Options:
- Reduce `cli-addon/types/application-types.d.ts` to just what the addon's command functions genuinely need.
- Or: have the generated `pikku-package.gen.ts` use the addon's own declared Config instead of the default one.

## 4. Workflow DSL vs complex-workflow

Separate from the extraction — cli-addon has `pikkuWorkflowComplexFunc` workflows (e.g. `allWorkflow`). Project `CLAUDE.md` says to prefer `pikkuWorkflowGraph` DSL over complex. Worth a pass eventually but out of scope for this refactor.

## 5. Scaffold `.gen.ts` drift from published CLI

`cli-addon/src/scaffold/{remote-rpc,rpc-remote,workflow-routes}.gen.ts` regenerated by `npx @pikku/cli@latest` reference `wireHTTP`/`wireQueueWorker`/`wireHTTPRoutes` which don't exist in current core. Not caused by the extraction — same drift hit the old `@pikku/cli` build and was patched with sed. Fix when the published CLI catches up, or port the sed patches.

## 6. Build flow

- `cli-addon`: `prebuild: npx @pikku/cli@latest all` + `build: tsc && cp -r .pikku dist/` (the `cp` step is needed because tsc doesn't copy pre-existing `.d.ts` files that the consumer needs for cross-package type resolution, e.g. `pikku-rpc-wirings-map.internal.gen.d.ts`).
- `cli`: same prebuild/build pattern. No sed patches for now.
- Long-term: once cli's own `pikku` binary is stable, switch cli-addon's prebuild to run against it (self-bootstrap) instead of npx — avoids published-version drift.

## 7. Type errors in services.ts after hydration

Currently ignored — cli-addon's `src/services.ts` uses hydration-only (`pikkuAddonServices((services) => services)`). This works at runtime but TS errors remain on:
- `pikkuAddonConfig` (return type must be `Config` but we're returning `services.config` which is `Config | undefined`)
- `pikku-package.gen.ts` Config mismatch (see #3)

Hydration is intentional as a temporary. Replace with a real `pikkuAddonServices` implementation that declares the services the addon needs (workflowService, getInspectorState) once the addon has its own slimmer types (see #3).
