# Coverage

Coverage is attributed by running scenarios against a server that is collecting it. It is **not** derived from unit tests.

Prerequisite in `pikku.config.json`:

```bash
pikku enable scenarios            # sets scaffold.scenarios = true
```

`scaffold.scenarios` is a boolean or `{ path? }` — whether the surface exists
and where it is written. A bare string is **rejected by the config loader**, not
reinterpreted: under a shape where a string could be a path, silently reading
one as a flag would be worse than failing.

`scaffold.scenarios` generates the coverage and stub RPCs into your project (`pikkuScenarioTakeLiveCoverage`, `pikkuScenarioResetLiveCoverage`, `pikkuScenarioResetStubs`, `pikkuScenarioGetStubCalls`), so scenario runs work against any server. The coverage RPC reads `<outDir>/function/pikku-functions-meta-verbose.gen.json` off disk at request time — codegen always writes it, but it has to be deployed alongside the app or the RPC returns `null`.

```bash
pikku dev --coverage                                   # V8 precise coverage, in-process
pikku dev --coverage --test                            # also enable stubs (needed for expectService)
SCENARIO_ACTOR_SECRET=… pikku scenario run local --coverage
```

The run resets coverage before each scenario and snapshots after, writing **`<outDir>/coverage/scenario-coverage.json`**:

```jsonc
{
  "generatedAt": "…",
  "environment": "local",
  "scenarios": {
    "<name>": {/* FunctionCoverageReport */},
  },
}
```

Coverage is best-effort: it disables itself with a warning if the server is not collecting or the first actor cannot invoke, and it needs at least one configured actor. If you get no coverage, check those first.

**There is no AI-prompt output.** The old `--ai-out` flag died with `pikku tests`; nothing replaced it. To find what needs work, read `scenario-coverage.json` yourself and cross-reference `pikku meta functions list` for input/output schemas.

## Filling coverage

1. `pikku scenario run <env> --coverage`, then read `<outDir>/coverage/scenario-coverage.json` to see what is unexercised.
2. `pikku meta functions list` for those functions' schemas.
3. Write a `pikkuScenario` that reaches them **through a real user flow** with an actor — not a scenario per function. Scenarios are flows; coverage is a consequence.
4. Re-run to confirm.

## Unit tests for pure logic

Scenarios are the repo-idiomatic way to test functions, and the only thing that contributes to live coverage. For pure logic with heavy branching, a plain unit test calling `func` directly is still valid and cheap:

```typescript
import { describe, test } from 'node:test'
import assert from 'node:assert'

describe('createTodo', () => {
  test('creates a todo', async () => {
    const services = {
      todoStore: { add: async (title: string) => ({ id: '1', title }) },
    }
    const result = await createTodo.func(services as any, { title: 'Buy milk' })
    assert.equal(result.title, 'Buy milk')
  })
})
```

```bash
node --import tsx --test src/**/*.test.ts
```

Services are plain objects — a Pikku function is pure business logic, so a mock is just the shape the function destructures. Build real services via the `pikkuServices` / `pikkuWireServices` factories when a test needs them.