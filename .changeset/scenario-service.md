---
'@pikku/core': patch
'@pikku/cli': patch
---

Move the scenario engine off `PikkuWorkflowService` onto a `PikkuScenarioService` the runner constructs, so no production bundle carries it.

Scenario support was built as members of `PikkuWorkflowService` — the class every Pikku server instantiates. A bundler drops an unused *module*, never an unused class *member*, so every deployed app was shipping the step runner, the lifecycle-hook runner, the actor registry, the browser-provider hooks and the `expectEventually`/`expectError`/`expectService` assertion wire, whether or not it had a single scenario. `resolveScenarioActors` pulled the HTTP actor client — and the AI persona conversation loop behind it — in with them.

All of it now lives in `PikkuScenarioService`, exported from a new `@pikku/core/scenario` entry point and reached only by `pikku scenario run`:

```ts
import { createScenarioRunner } from '@pikku/core/scenario'

const { workflowService, scenarioService } = createScenarioRunner()
```

Measured with esbuild against `InMemoryWorkflowService`: the production bundle drops 35 KB and every `sign-in/actor`, `runConversation`, `expectEventually` and `ScenarioHookError` occurrence, along with the scheduler runner that `wire.runScheduledTask` pulled in. The one remaining `scenarioStep` reference in a production bundle is the RPC guard that refuses to expose a step over `/rpc` — a security check, not scenario machinery.

`PikkuScenarioService` is **not** a workflow service. A scenario is not a different kind of run — it is the same durable run with a step vocabulary on top — so it is installed onto one rather than subclassing it. `PikkuWorkflowService` gains a single `setRunExtension(create)` slot, and calls the installed `WorkflowRunExtension` at six points: `attachRunContext`, `detachRunContext`, `decorateRunWire`, `decorateWorkflowWire`, `onBeforeRunFunc`, `onAfterRunFunc`. Nothing on that interface names scenarios.

The extension is built from a `WorkflowRunEngine` handle the service hands it — `inlineStep`, `updateRunStatus`, `onChildWorkflowFailed`, `verifyStepName` — which is what lets a scenario record a durable step without any of those becoming public API on the service every production app instantiates.

```ts
const workflowService = new InMemoryWorkflowService()
const scenarioService = workflowService.setRunExtension(
  (engine) => new PikkuScenarioService(engine)
)
```

`{ actor }` on a workflow step is deliberately **not** part of the move: `scenario.do(name, rpc, data, { actor })` dispatches through the base wire's `do`, so the actor branch stays in `rpcStep`.

**Behaviour change:** a scenario started on a *server* rather than through the runner (the console can start any registered workflow by name) no longer resolves actors or runs `before`/`after` hooks — a server's workflow service is not a scenario service. Run scenarios with `pikku scenario run`.
