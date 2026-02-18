# Workflow Deployment Safety Step Contract

This file defines required behavior for step implementations used by:

- `e2e/features/workflow-deployment-safety.feature`

## Naming and Scope

- `stack` entries are process aliases.
- A `profile` is a generated/treeshaken deployment variant of the same app.
- `run "current"` always refers to the most recently started workflow run in scenario context.

## Required Step Semantics

1. `Given stack is running:`
- Build/generate each listed profile.
- Start each server as an isolated OS process.
- Assign unique env per process (`PORT`, namespace, db/schema, queue prefix).
- Persist process handles and metadata in scenario context by `name`.

2. `When I start workflow "<workflowName>" via "<serverAlias>" with fixture "<fixtureKey>"`
- Call the public API/RPC surface exposed by the server alias.
- Store returned run id as scenario `currentRunId`.

3. `And run "current" is queued but not completed`
- Poll workflow state via public/read API.
- Assert state is non-terminal (`running`, `queued`, or equivalent).

4. `And I replace process "<oldAlias>" with profile "<newProfile>" as "<newAlias>"`
- Stop old process cleanly.
- Build/generate new profile if needed.
- Start new process with isolated env.
- Keep shared queue/storage namespace unless scenario says otherwise.

5. `Then run "current" status eventually becomes "<status>"`
- Poll until timeout.
- Fail on timeout.

6. `Then run "current" status eventually becomes one of:`
- Same as above, but allow any listed terminal status.

7. `And run "current" output matches fixture "<fixtureKey>"`
- Compare stable fields only (fixture-defined matcher).

8. `And run "current" has no duplicate successful step executions`
- Read step state/history for run.
- Group by logical step id/name.
- Assert no step has more than one successful terminal execution.

9. `And worker execution trace for run "current" is captured`
- Record worker/process alias and step ids executed.
- Persist artifact under `e2e/reports/artifacts/`.

10. `And persisted workflow version for run "current" is removed`
- Remove version record from persistence layer (db/redis), not in-memory state mutation.
- Do not mutate `pikkuState` directly.

11. `And deployment-aware queue routing is enabled`
- Enable via env/config flag for started worker processes.
- No code patching during scenario.

12. `And all successful steps for run "current" were executed by compatible workers`
- Validate worker/version compatibility against run version metadata.

13. `And run "current" error code equals one of:`
- Assert terminal failure and allowed code set.

## Non-Goals

- Do not use direct runtime metadata mutation (e.g. `pikkuState` edits) in these E2E steps.
- Do not rely on in-process test-only hooks for orchestration decisions.
