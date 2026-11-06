# Workflow reliability sweep — findings

Chaos testing of Pikku's DSL workflows against the `e2e` harness: realistic
multi-step workflows built only from `pikkuWorkflowFunc` (never
`pikkuWorkflowComplexFunc`), with every step a stub whose delay and failure mode
are driven from the workflow input, plus `kill -9` and restart mid-run.

Eight findings. Seven are fixed and verified; one is reported with a
recommendation but deliberately not applied, for the reason given below.

**Regression gate after all changes:** core 1938 pass / 0 fail · inspector 655/655
· schedule 2/2 · e2e unit 13/13 · **e2e scenarios 141/141**.

---

## What was built

| File                                                      | Purpose                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `e2e/packages/functions/src/functions/chaos-ledger.ts`    | File-backed side-effect ledger (survives a crash, unlike a module-level map)                |
| `e2e/packages/functions/src/functions/chaos.functions.ts` | `chaosStep` / `chaosCompensate` / `chaosReadLedger` — delay and failure injected from input |
| `.../workflows/chaos-order-saga.workflow.ts`              | Order fulfilment saga: retries + `onError` compensation                                     |
| `.../workflows/chaos-onboarding.workflow.ts`              | `sleep` + `suspend` + `approval` + branch + compensation                                    |
| `.../workflows/chaos-fanout.workflow.ts`                  | Concurrent shards with a poisoned sibling                                                   |
| `.../workflows/chaos-restart.workflow.ts`                 | Three phases separated by timers, shaped to be killed                                       |

Failure is injectable two ways on purpose. `failAttemptsBelow` reads the durable
`attemptCount`, so a replay reaches the same verdict — deterministic flakiness.
`dependency` reads an external file switch, so a dependency can be held down
across attempts and healed by hand mid-run, which is the only way to see a retry
succeed for a reason the workflow did not already know.

## Scenario results (after fixes)

| Suite                                                                  | Result                  |
| ---------------------------------------------------------------------- | ----------------------- |
| Saga: happy path, flaky-then-recovers, fatal-then-compensates          | **9/9**                 |
| Combinations: fan-out ×2, approval approved/rejected, explicit suspend | **13/13**               |
| Crash + restart                                                        | **6/6** — see finding 6 |

Confirmed working: retries with a stable `invocationId` across attempts;
compensation firing exactly once rather than per attempt; healthy siblings of a
failed parallel branch neither lost nor re-executed; approval gates suspending
and resuming with a validated decision payload; rejection branch skipping the
grant and compensating.

---

## 1. `packages/cli/build.sh` bootstrap was broken on `main` — FIXED

`yarn build` failed at `@pikku/cli`:

```
The requested module '@pikku/core' does not provide an export named 'createSecretValue'
```

The CLI bootstraps itself with a _published_ CLI in a throwaway npm tree,
pinning `@pikku/cli`, `@pikku/inspector`, `@pikku/better-auth` and
`@pikku/core` — but not `@pikku/kysely`, which arrives transitively at a
floating `^0.13.7`. `@pikku/kysely@0.13.10` imports `createSecretValue` at
module load; the pinned `@pikku/core@0.12.74` predates that export (added in
HEAD's #1126). npm resolved 0.13.10 and the bootstrap CLI died importing its own
dependency graph.

This is the failure class `build.sh`'s own comment warns about — "a pin is only
as good as the exports that tree depends on" — recurring through a package the
comment does not cover.

**Fix:** core pin → 0.12.77, and `@pikku/kysely` pinned alongside it in both
`dependencies` and `overrides`.

## 2. Codegen names a schema it never generates — FIXED (new PKU463)

A named contract type that is **declared but not exported** produces a dangling
reference: the function meta carries `inputSchemaName: 'ChaosInput'`, no
`ChaosInput.schema.json` is emitted, and `pikku all` exits **0**. The failure
surfaces only on the first call, in production:

```
MissingSchemaError: Schema 'ChaosInput' not found. Ensure schema generation has been run.
```

Cause: `generateCustomTypes` builds a virtual TS file that _imports_ each named
contract type for `ts-json-schema-generator`. An import of a non-exported type
resolves to nothing, so no schema is produced, and nothing checks afterwards.

**Fix:** `validateSchemaReferences` in the inspector — run after addon schemas
are merged — reports every `inputSchemaName`/`outputSchemaName` with no
generated schema. Severity `error`: printed always, blocks CI under
`--fail-on-error`, does not stop a dev server over a function nobody calls.

## 3. An explicitly-`undefined` property kills the step — FIXED

```
Instances of "undefined" type are not supported.
  at CFWorkerSchemaService.validateSchema
  at SQLiteKyselyWorkflowService.runInlineRetryLoop
```

JSON Schema cannot describe such a property, so the validator rejects the whole
instance rather than the field. The reliability consequence is a **transport
asymmetry**: `JSON.stringify` drops undefined-valued keys over HTTP, so the
payload is unrepresentable there, while an in-process dispatch hands the object
over intact. Identical workflow, different outcome depending on where the step
ran.

This detonates on the most ordinary thing a DSL workflow does:

```ts
await workflow.do('Charge payment', 'chargeRPC', {
  retries: data.maybeRetries, // undefined whenever the caller omits it
})
```

**Fix:** `stripUndefinedValues` in `packages/core/src/schema.ts`, applied in
`validateSchema`. Recursive, copies nothing unless an `undefined` is found, and
deliberately not a JSON round-trip — `coerceTopLevelDataFromSchema` puts real
`Date` instances on the data first and stringifying would flatten them. An
explicitly-undefined _required_ field now reports as the missing property it is.

## 4. Async workflows containing `sleep` never finished — FIXED (most severe)

A DSL workflow with `workflow.sleep(...)` started through `POST
/workflow/:name/start` **hung forever at the first sleep**. No crash needed. The
run sat at `status: running` indefinitely; the sync `/run` path worked, which is
why it went unnoticed.

Server log:

```
ERROR: Failed to execute delayed RPC 'pikkuWorkflowSleeper':
  ScheduledTaskNotFoundError: Scheduled task not found: pikkuWorkflowSleeper
```

`scheduleSleep` schedules the wake-up under `sleeperRPCName =
'pikkuWorkflowSleeper'`, which the workflow service registers as an **RPC**
(`addFunction`, `pikku-workflow-service.ts:483`). But
`InMemorySchedulerService.scheduleRPC` — despite its name and its "delayed RPC
call" docstring — fired `runScheduledTask({ name: rpcName })`, which resolves
against the **cron task registry**. The sleeper is not there, so it threw, the
error was swallowed into a log line, and the run was orphaned.

A second defect in the same function: `data` was captured in `delayedTasks` but
**never passed** to the callback, so `{ runId, stepId }` was dropped — the
sleeper could not have identified the sleeping step even if the lookup had
succeeded.

The BullMQ and pg-boss schedulers already do the right thing: enqueue
`{ rpcName, data, session }` and have the generated `pikku-mesh-rpc`
worker call `rpc.invoke(rpcName, data)`. The in-memory implementation was the
odd one out.

**Fix:** invoke the RPC with its data via `rpcService.getContextRPCService`,
matching the other schedulers. Regression test added and verified to fail
against the old implementation. The pre-existing test only asserted that
scheduling _returned an id_ — never that the RPC ran, which is how this
survived.

## 5. e2e stored workflow runs in memory — FIXED

`e2e/src/services.ts` used `new Database(':memory:')`, so a killed server lost
every run and `GET /workflow/:name/status/:runId` answered `Run not found`. A
framework that recovers correctly and one that drops the run produce the
identical observation, so crash tests against it prove nothing.

**Fix:** `SQLITE_PATH` selects a file; the default stays `:memory:` so the
standard suite is unaffected. Recorded in
`e2e/knowledge/decisions/durability-is-only-observable-against-a-file.md`.

---

## 6. An interrupted run is never resumed — FIXED

**A graceful restart behaved exactly like a crash, so an ordinary deploy
permanently stranded every workflow that was mid-sleep or mid-step.** `kill -9`
and `SIGTERM` both left the run `running` forever. Nothing was double-executed:
the step records were correct, they were simply never acted on again.

Reproducing against `539c25d34`, which already had `recoverStalledRuns` and
`relayUndispatchedSteps`, showed the original cause was only half the story:

1. **Nothing ran the sweeps.** They were "not self-starting", and neither
   `pikku dev` nor `pikku serve` started them.
2. **A sleeping run was invisible to them.** A sleep whose timer died is
   `scheduled`, which `findStalledRunIds` reads as in flight and replay reads as
   "something is coming". That is why six `resumeWorkflow` calls did nothing: a
   replay stops at a `scheduled` step whoever asks. A queued step whose job died
   with an in-memory queue parks the same way.
3. **A step killed mid-pass read as owned forever.** An ordinary RPC step runs
   inside the orchestrator's pass, not through the step queue, so it has no step
   lease. `running` with a null lease is what the sweep and the claim both take
   for "parked on a child run", which is why re-enqueuing the step job by hand
   did nothing even after the lease had lapsed: there was no step lease to lapse,
   and the claim refuses a null one.

**Fix:** `workflowService.startRecovery()`, started by `pikku dev` and `pikku
serve` once they are serving. It sweeps at startup and every 30s.

| Caught in    | What recovery does                                                             |
| ------------ | ------------------------------------------------------------------------------ |
| Sleep        | Re-armed for what remains from when it was scheduled; woken at once if overdue |
| Step (pass)  | Retried at least once, as a counted attempt with the same `invocationId`       |
| Step (queue) | Sent again once its job looks lost; the claim keeps a duplicate from running   |
| Fan-out      | Settled shards stay memoized, shards in flight retry, each as above            |

Ownership is the run lease, not process state. A sweep takes `workflow-run:<id>`
before it touches a run, so a run in a live instance's pass is skipped, and a dead
instance's lease frees itself within its 30s TTL. That TTL is why a run killed
mid-step takes up to 30s to move, while a sleeping run moves at startup. Timers
re-armed by two instances both fire, which is harmless: a wake-up only sets a
sleep's result to the same `null`, and resuming is idempotent. Runs keep their
original trace, since every hop already reads it from the run record.

**Crash + restart suite: 6/6**, in `e2e/tests/cli/workflow-trace-restart.test.ts`:
each of `kill -9` and `SIGTERM` taken mid-sleep, mid-step and across a fan-out
with one shard settled. This replaces the earlier 4/9, whose nine cases were never
checked in. The ledger shows settled work ran exactly once and in-flight work ran
again as the same `invocationId` at attempt 2, and every effect, before and after
the kill, is on the run's own trace.

**Limits:** an `inline` step body (`workflow.do` with a function) replays without
counting an attempt. A step with `retries: 0` that is caught in flight fails with
`WorkflowStepLeaseExpiredError` rather than retrying, because it spent its one
attempt. Hosts with no long-lived process call `recoverWorkflows()` from a
scheduled task. Graph workflows use the same sweeps but are not in the crash
suite. See
`packages/core/knowledge/decisions/internals/a-run-belongs-to-its-lease-not-its-process.md`.

## 7. `onError` compensation cannot identify what to compensate — REPORTED, NOT FIXED

A step's `onError` handler is invoked with `{ error: { message } }` and nothing
else — not the failed step's input. The DSL type comment calls this
"compensation", but a compensation cannot release _which_ inventory reservation
or refund _which_ payment when it is not told which order failed. A handler that
declares a required identifying field fails validation instead:

```
Instance does not have required property "key".
```

All three dispatch sites agree on this payload (`runStepCompensation`, and both
graph paths in `graph-runner.ts`).

**Recommendation:** pass the failed step's input alongside the error.

**Why not applied:** it would be a breaking change, not an additive one.
Generated schemas set `additionalProperties: false` — 154 of them in the e2e
project alone — so an existing handler typed `{ error: {...} }` would start
_failing validation_ the moment an extra `input` property arrived. It needs
either an opt-in step option or a deliberate major-version change. Worked around
in the harness by making `key` optional and falling back to the run id.

---

## 8. `yarn build` generated apps before the addons they reference — FIXED

`recipes/nextjs` printed this on every build:

```
[pikku] Skipping HTTP route 'GET /workflow-run/:runId/stream' — metadata not found.
```

That route is the console's **live workflow-run SSE stream**, and it was being
dropped at runtime: the scaffolded `wireHTTPRoutes` call executes (which is why
it warns), but `pikkuState(null,'http','meta')` has no entry for it, so
`wireHTTP` returns early and the endpoint simply does not exist.

It is the only one of the 17 scaffolded routes affected, and the difference is
what its handler is:

```ts
func: ref('console:streamWorkflowRun') // dropped — addon-namespaced ref
func: workflowStatusStream // fine  — local symbol
```

An addon ref can only be resolved into HTTP meta if the addon's generated meta
exists at codegen time. It did not, because the root build ran:

```
build:packages && yarn pikku && build:addons && build:templates
                  ^^^^^^^^^^    ^^^^^^^^^^^^
                  generates     builds the addons the
                  the apps      apps were just generated against
```

Regenerating `recipes/functions` once the addons were built put the route
straight into the meta, which confirmed the ordering as the cause. CI's e2e job
sidesteps this with a bespoke two-pass `e2e-codegen` action; the templates path
had no equivalent.

**Fix:** `build:addons` moved ahead of `yarn pikku`. Verified by deleting the
template HTTP meta to recreate the broken state, running a full `yarn build`,
and confirming zero skip warnings with the route present in the meta.

**Worth noting separately:** an unresolvable route is dropped with a
`console.warn` and an exit code of 0. That is why a dead console endpoint
survived in a shipped template — the same silent-drop shape as finding 2, and a
candidate for a coded diagnostic.

## Also verified working

Probed and found correct, no fix needed: approval-gate **expiry** (takes the
`expired` branch rather than hanging or failing); `WorkflowCancelledException`
reported as `cancelled` rather than `failed`; two concurrent runs of the same
workflow with identical input producing two distinct runs with no cross-run
collision in step bookkeeping.

## Smaller observations

- `e2e/package.json` declares `"start": "tsx bin/start.ts"` and `"main":
"bin/start.ts"`, but `bin/` contains only `backend-harness.ts`. The working
  path is `pikku serve`.
- When virtual user sign-in is not open, `seedScenarioVirtualUsers` logs a skip and returns,
  then `seedScopes` throws `no user for admin@virtualuser.local` from `afterStart`
  and **takes the whole server down**. A graceful skip followed by a fatal
  dependency on what was skipped is worth reconciling.
- `npx pikku` cannot see the workspace binary until `packages/cli/dist` exists
  at install time (Yarn Berry keeps its own bin registry). Since
  `.github/actions/e2e-codegen` and the scenario runner's `--spawn` both shell
  out to `npx pikku`, a fresh clone that builds after installing gets
  `npm error could not determine executable to run`. A second `yarn install`
  after the build creates the link.
