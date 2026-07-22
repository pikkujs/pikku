---
name: pikku-scenario
description: >-
  Use when writing or running Pikku scenarios, or when asked to test Pikku functions or improve
  test coverage. A scenario (pikkuScenario) drives the app the way users do — steps run as actors
  over the real transport against a running server — so a flow doubles as an e2e test and a
  staged/production health check. Covers scenario.do / expectEventually / expectError /
  expectService, actors and environments in pikku.config.json, SCENARIO_ACTOR_SECRET, the
  `pikku scenario list|run` commands, live function coverage via `pikku dev --coverage`, and
  plain unit tests for pure function logic. TRIGGER when: user asks about scenarios, testing a
  Pikku function, test coverage, end-to-end flows, or health checks. DO NOT TRIGGER when: user
  asks about browser/UI e2e (that is @pikku/cucumber, out of scope), running an existing test
  suite (use Bash), or CI configuration.
installGroups: [core]
---

# Pikku Scenarios

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing: `pikku scenario list` for what exists, `pikku info functions --verbose` for what a scenario can call.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, or build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated.
4. Validate with the narrowest relevant command first, then `pikku all --tsc` when functions, wirings or schemas may have changed.
5. If validation fails, fix the source cause and rerun. Do not paper over generated errors by editing generated files.

**`pikku tests` does not exist.** It was removed in #865 — scenarios own coverage now. Any reference you find to it is stale.

## What a scenario is

A scenario is a `pikkuScenario` export that drives the app **as real actors over the real transport**, against a running server. That is what lets one artifact serve as both an e2e test and a staged/production health check.

Consequences that matter, and bite if ignored:

- **There is no state reset.** A scenario runs against a live server. Scope what you create (unique ids, your own rows) and never assume a clean database.
- **Every step needs an actor.** `scenario.do(...)` without `{ actor }` throws `Scenario tried to run '<rpc>' as an internal step…`. There is no bare internal-RPC step.
- **Actors must be configured and signed in**, or the scenario cannot run.

Scenarios live in `srcDirectories` like any other function — by convention `*.scenario.ts`.

## Writing one

`pikkuScenario` comes from the **generated** workflow types, not `@pikku/core`:

```typescript
import { pikkuScenario } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const orderSupportScenario = pikkuScenario<
  { value?: number },
  { doubled: number; message: string }
>({
  title: 'Order support (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, data, { scenario, actors }) => {
    if (!actors?.shopper || !actors?.support) {
      throw new Error(
        'orderSupportScenario needs run actors (shopper + support) — run via `pikku scenario run <environment>`'
      )
    }

    const doubled = await scenario.do(
      'shopper doubles their order',
      'doubleValue',
      { value: data?.value ?? 21 },
      { actor: actors.shopper }
    )

    const settled = await scenario.expectEventually(
      'support sees the greeting settle',
      'formatMessage',
      { greeting: 'Hello', name: 'Support' },
      (out: { message: string }) => out.message.length > 0,
      { actor: actors.support, within: '5s', interval: 50 }
    )

    return { doubled: doubled.result, message: settled.message }
  },
})
```

A scenario takes the same config fields as a workflow (`title`, `description`, `tags`, `input`/`output`, `auth`, `permissions`, `middleware`, `version`, …). The third argument is the scenario context: `{ scenario, actors }`.

### The scenario API

| Call                                                                                 | Purpose                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `scenario.do(step, rpc, data, { actor })`                                            | Run an RPC as that actor. The step name is what appears in the run output.                                           |
| `scenario.expectEventually(step, rpc, data, predicate, { actor, within, interval })` | Poll until `predicate(out)` passes or `within` elapses. For anything asynchronous — queues, workers, eventual state. |
| `scenario.expectError(step, rpc, data, { actor, matches })`                          | Assert the call **fails**. For fault injection and negative paths.                                                   |
| `scenario.expectService(step, 'service.method', { actor, calledWith })`              | Assert a stubbed service was called. Requires the server to run with `--test`.                                       |

`expectEventually` is **scenario-only**. Calling it from a `pikkuWorkflowFunc` is a critical inspector error (`PKU675`) pointing you at `pikkuScenario`.

Prefer `expectEventually` over sleeping. There is no `beforeEach`/`afterEach` — a scenario is a plain async function.

## Configuration

Actors and environments live in `pikku.config.json`:

```json
{
  "scenarios": {
    "actors": {
      "shopper": {
        "email": "shopper@actors.local",
        "name": "Shopper",
        "jobTitle": "First-time buyer",
        "personality": "Impatient shopper who abandons slow checkouts"
      },
      "support": { "email": "support@actors.local", "name": "Support" }
    },
    "environments": {
      "local": {
        "apiUrl": "http://localhost:4077",
        "signInPath": "/api/auth/sign-in/actor"
      }
    }
  }
}
```

- `environments.<name>.apiUrl` is required. `signInPath` defaults to `/auth/sign-in/actor`, `rpcPath` to `/rpc`.
- **`SCENARIO_ACTOR_SECRET` is an environment variable and never goes in `pikku.config.json`.** It signs actors in. `pikku scenario run` throws without it; a server auto-building actors warns and runs without them.

## Running

```bash
pikku scenario list                       # name [tags] + description; takes no options
SCENARIO_ACTOR_SECRET=… pikku scenario run local
SCENARIO_ACTOR_SECRET=… pikku scenario run local --flows orderSupportScenario
SCENARIO_ACTOR_SECRET=… pikku scenario run local --tags smoke,scenario
```

`run` takes the environment as a **required positional** — the key from `scenarios.environments`. `--flows`/`-f` filters by scenario name, `--tags`/`-t` by tag (match-any).

Output is `PASS <name> (<ms>) → <output>` / `FAIL <name> (<ms>): <error>`, then `N/M scenarios passed against '<env>'`.

**Exit code is 1** if any scenario fails _or_ if no scenario matched the filter — a typo'd `--flows` is a hard error, not a silent zero-run pass. It throws outright on an unknown environment, an unknown flow name, or a missing `SCENARIO_ACTOR_SECRET`.

## Coverage

Coverage is attributed by running scenarios against a server that is collecting it. It is **not** derived from unit tests.

Prerequisites in `pikku.config.json`:

```json
{ "scaffold": { "scenarios": "auth" }, "verboseMeta": true }
```

`scaffold.scenarios` generates the coverage and stub RPCs into your project (`pikkuScenarioTakeLiveCoverage`, `pikkuScenarioResetLiveCoverage`, `pikkuScenarioResetStubs`, `pikkuScenarioGetStubCalls`), so scenario runs work against any server. `verboseMeta` is required — the coverage RPC reads the verbose functions meta and returns `null` without it.

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
    "<name>": {
      /* FunctionCoverageReport */
    },
  },
}
```

Coverage is best-effort: it disables itself with a warning if the server is not collecting or the first actor cannot invoke, and it needs at least one configured actor. If you get no coverage, check those first.

**There is no AI-prompt output.** The old `--ai-out` flag died with `pikku tests`; nothing replaced it. To find what needs work, read `scenario-coverage.json` yourself and cross-reference `pikku meta functions list` for input/output schemas.

### Filling coverage

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

## Red flags

| Smell                                         | Why it's wrong                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pikku tests …`                               | Removed in #865. Use `pikku scenario`.                                                                    |
| `.feature` files / Gherkin for function tests | Scenarios are TypeScript, not Gherkin. The in-process cucumber function world was deleted.                |
| `scenario.do(...)` with no `{ actor }`        | Throws. Every step runs as somebody.                                                                      |
| A scenario per function                       | Scenarios are user flows. One flow covers many functions; that is the point.                              |
| Assuming a clean database                     | There is no state reset — it may be a staging server. Scope what you create.                              |
| `sleep()` before asserting                    | Use `expectEventually`.                                                                                   |
| `expectEventually` in a `pikkuWorkflowFunc`   | `PKU675` — scenario-only.                                                                                 |
| Coverage silently 0                           | Server not run with `--coverage`, `verboseMeta` off, `scaffold.scenarios` unset, or no actors configured. |

`@pikku/cucumber` is a **browser/e2e** harness (`Actor`, `BrowserWorld`, `PersonaData`, `DbUtils`) — out of scope here.

See `pikku-concepts` for the core mental model.
