---
'@pikku/core': patch
'@pikku/cli': patch
---

Type a scenario actor's `invoke` over the project's exposed RPC map, and give a step the environment it targets.

`ScenarioActor` is now generic in the RPC surface it can reach, and the generated `pikku-scenario-actors.gen.ts` binds it to `FlattenedRPCMap` — exactly the `/rpc/:name` surface an HTTP actor can reach. An unknown RPC name or a payload of the wrong shape is a compile error rather than a 400 mid-run, and the result is narrowed instead of `unknown`:

```ts
const listed = await actor.invoke('todos:listTodos', { limit: 5 })
const todos: string[] = listed.todos
```

`wire.scenarioStep.actor` stops being `any`: `PikkuWire` takes the project's actor registry as a type argument, threaded through the generated function types. The actors file is now written even for an empty registry, so `TypedScenarioActors` is always a resolvable import.

Alongside it:

- **`invokeRaw(rpcName, data, { headers })`** on `ScenarioActor`, reporting `{ status, ok, body }` rather than throwing. A refusal is the expected outcome of a permissions or scopes scenario, and `invoke`'s error truncates the body naming which scope was missing. `invoke` is now `invokeRaw` plus a throw on `!ok`. The `headers` option is how a step expresses an identity the actor registry cannot.
- **`scenarioStep.env`** — `{ apiUrl, appUrl? }`, from `scenarios.environments[<environment>]`. Steps run in the CLI process, where there is no `variables` service, so without this every raw-HTTP step would reach for `process.env`. A run started on a server falls back to its own `API_URL`/`APP_URL`.
- **`requireActor(scenarioStep)` and `requireScenarioEnv(scenarioStep)`** exported from `@pikku/core/workflow`, replacing the hand-rolled `actorOf(...)` guard each step file was writing. Both name the step and say what to pass.
