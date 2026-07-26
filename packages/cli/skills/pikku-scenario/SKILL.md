---
name: pikku-scenario
description: >-
  Use when writing or running Pikku scenarios, or when asked to test Pikku functions or improve
  test coverage. A scenario (pikkuScenario) drives the app the way users do — steps run as actors
  over the real transport against a running server — so a flow doubles as an e2e test and a
  staged/production health check. Covers scenario.do / expectEventually / expectError /
  expectService, declared steps via pikkuScenarioStep (including browser steps driven by
  @pikku/playwright), actors and environments in pikku.config.json, SCENARIO_ACTOR_SECRET, the
  `pikku scenario list|run` commands, live function coverage via `pikku dev --coverage`, and
  plain unit tests for pure function logic. TRIGGER when: user asks about scenarios, testing a
  Pikku function, test coverage, end-to-end flows, browser/UI e2e, or health checks. DO NOT
  TRIGGER when: user asks about running an existing test suite (use Bash) or CI configuration.
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
- **Every effect runs as somebody, or as a declared step.** `scenario.do(...)` without `{ actor }` throws `Scenario tried to run '<rpc>' as an internal step…` — there is no bare internal-RPC step. The other way to do work is `scenario.step/given/when/then`, which runs a `pikkuScenarioStep`; its actor is optional (setup steps have none) unless it declares `browser: true`.
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
| `scenario.step(step, stepName, data, { actor })`                                     | Run a declared `pikkuScenarioStep`. `given`/`when`/`then` are the same call with a keyword in the rendered prose.    |

`expectEventually` is **scenario-only**. Calling it from a `pikkuWorkflowFunc` is a critical inspector error (`PKU675`) pointing you at `pikkuScenario`.

Prefer `expectEventually` over sleeping.

### Setup and teardown (`before` / `after`)

A scenario config takes `before` and `after`. Both have the **same signature as `func`** — `(services, data, wire)` — with the return value discarded:

```typescript
const resetsCredentials = async (_services, _data, { actors }) => {
  await actors!.admin!.invoke('resetCredentials', {})
}

export const credentialScenario = pikkuScenario({
  title: 'A credential is loaded on first use',
  tags: ['scenario', 'credential'],
  before: resetsCredentials,
  after: removesInstalledAddon,
  func: async (services, data, { scenario, actors }) => { /* … */ },
})
```

| Rule                                                                                                     |
| -------------------------------------------------------------------------------------------------------- |
| `before` throwing skips the body and fails the run — but `after` still runs.                             |
| `after` always runs, in a `finally`, whether the scenario passed or failed.                              |
| `after` throwing fails a run that would otherwise have passed.                                           |
| `after` throwing on an already-failed run attaches as the `cause` and never replaces the original error. |
| Neither runs when the run is suspended or waiting — teardown only fires at a terminal outcome.           |
| Hooks are **not** ladder rows. The runner records nothing for them; a failure is labelled by phase.      |

A hook reaches the app the same way the body does: through `wire.actors`. If you want cleanup to be *visible* on the ladder, make it an ordinary `scenario.then(...)` instead.

Hooks are scenario-only. A `before`/`after` on a `pikkuWorkflowFunc` never runs — a workflow is durable and resumable, so a callback that reran on every replay would have no honest meaning.

### Grouping scenarios (`pikkuFeature`)

`pikkuFeature` groups scenarios the way gherkin's `Feature:` groups `Scenario:`. Scenarios are referenced by **imported identifier**, so a renamed or deleted scenario is a compile error rather than a silent skip:

```typescript
import { pikkuFeature } from '#pikku/workflow/pikku-workflow-types.gen.js'
import {
  credentialLazyLoadScenario,
  credentialRoundTripScenario,
} from './credential.scenario.js'

export const credentialFeature = pikkuFeature({
  name: 'Credential API',
  description: 'Credentials resolve lazily and are scoped per user',
  tags: ['credential'],
  before: startsMockOAuthServer,
  after: stopsMockOAuthServer,
  scenarios: [
    credentialLazyLoadScenario,
    ...['stripe', 'google', 'hmac-key'].map((name) => ({
      scenario: credentialRoundTripScenario,
      data: { name },
    })),
  ],
})
```

| Rule                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------- |
| The **export identifier is the feature's id**; `name` is the human-readable label. Both must be exported or the build fails.              |
| A `{ scenario, data }` entry is gherkin's `Examples:` — one run per entry. `data` is typed against that scenario's input.                 |
| Feature hooks run **once around the whole group** (`before → a → b → c → after`), _not_ per scenario. `after` runs in a `finally`.         |
| There is deliberately **no `Background:`**. Per-scenario setup is the scenario's own `before`, referencing a shared function.             |
| A scenario's effective tags are its own **plus** the feature's, so `--tags credential` selects through the feature.                       |
| A scenario need not belong to a feature — one with no input still runs standalone.                                                        |
| Membership is resolved by **object identity** at runtime, which is why a loop works and why a scenario built inline in a feature is an error. |

The **feature is the run unit**: `--flows` on a scenario whose every feature entry carries `data` errors and names the features containing it, because the feature is what supplies that data. Use `--features` for those. A scenario referenced bare anywhere, or in no feature at all, still runs standalone.

### Declared steps (`pikkuScenarioStep`)

`scenario.do` can only name an RPC. A **step** is a named, typed unit of scenario behaviour whose body is an ordinary pikku function — so it can call several RPCs as its actor, assert, or drive a browser.

```typescript
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { requireActor } from '@pikku/core/workflow'

export const buysAnApple = pikkuScenarioStep<
  { qty: number },
  { orderId: string }
>({
  name: 'buysAnApple',
  description: 'buys an apple',
  template: 'buys {qty} apples',
  func: async (_services, { qty }, { scenarioStep }) => {
    return await requireActor(scenarioStep).invoke('placeOrder', { qty })
  },
})
```

```typescript
await scenario.given(
  'buys an apple',
  'buysAnApple',
  { qty: 1 },
  { actor: actors.shopper }
)
// reporter renders: Given the shopper buys 1 apples   ✓  412ms
```

Rules that bite:

- **The step is referenced by its typed string name, not by importing the const** — exactly like `workflow.do`. The name is the step's `pikkuFuncId` and is checked against the generated step map. A non-literal target is a critical error (`PKU678`).
- **Steps are not RPCs.** They are deliberately never network-callable — a browser-driving step must not be.
- **`actor.invoke` is typed over the exposed RPC map**, so the name and the payload are checked and the result comes back narrowed — no cast. `actor.invokeRaw(name, data, { headers })` is the same call reporting `{ status, ok, body }` instead of throwing; use it whenever the refusal *is* the assertion.
- **`actor` and `env` are optional on the wire**, because a pure assertion step needs neither. Narrow them with `requireActor(scenarioStep)` and `requireScenarioEnv(scenarioStep)` from `@pikku/core/workflow` rather than a local guard — both name the step and say what to pass. `env` is `{ apiUrl, appUrl? }` from the environment the run targets, and is how a raw-HTTP step learns the target's URL: a step runs in the CLI process, where there is no `variables` service and `process.env` is not the answer.
- **Steps default to `retries: 0`**, unlike ordinary workflow steps. Retrying a failed assertion is wrong; pass `retries` explicitly if a step is genuinely flaky-by-nature.
- **Step results are persisted**, so return JSON-serialisable data — never a `Locator` or a client object.
- **`description` documents the step; `template` is what the report renders.** `template`'s `{placeholders}` are filled from the input the step was called with, so one step reads differently for each call — `sees {state} addon {packageName}` reports as "sees available addon @pikku/addon-stripe". Reflect every input field in the template, and type the values so they read as words (`state?: 'installed' | 'available'`, not `installed?: boolean`). A placeholder with no value renders as nothing and the whitespace collapses.
- Prose precedence is `options.description` → the step's `template` → the step's own `description` → the positional step name. Repeated names get `#1`, `#2` ordinals, so a `for` loop over a data set is how you write a Scenario Outline. A loop-generated step name is not statically known, so it is matched back to its declaration by step function instead — which works as long as that function's call sites agree on their phase, actor and prose. Two call sites that disagree make the loop step report under its bare runtime name.

### Browser steps

A step declaring `browser: true` gets `wire.browser` — a session bound to **its actor**, signed in through the same `signInPath` + `SCENARIO_ACTOR_SECRET` path the HTTP actors use, so the browser and the RPC calls are one identity. Calling such a step without an actor is a critical error (`PKU677`).

```typescript
export const opensTheCart = pikkuScenarioStep<
  { path: string },
  { url: string },
  true
>({
  name: 'opensTheCart',
  description: 'opens the cart',
  browser: true,
  func: async (_services, { path }, { browser }) => {
    await browser.goto(path)
    return { url: browser.page.url() }
  },
})
```

- Install `@pikku/playwright` and `@playwright/test`, and import `@pikku/playwright` once (`import type {} from '@pikku/playwright'`) so `browser.page` is a typed Playwright `Page`. Without it you still get the structural `goto`/`screenshot` handle.
- The environment needs an `appUrl` beside its `apiUrl`. `pikku scenario run` fails fast before running anything if a browser scenario has no `appUrl` or the driver is not installed.
- `pikku scenario run <env> --no-browser` **skips** scenarios containing browser steps and reports them as skipped — it does not fail them. That is how a machine with no browser stays green.
- Playwright auto-waits; do not wrap `page.click` in `expectEventually`.

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
pikku scenario list                       # features with their scenarios indented, then ungrouped scenarios
SCENARIO_ACTOR_SECRET=… pikku scenario run local
SCENARIO_ACTOR_SECRET=… pikku scenario run local --flows orderSupportScenario
SCENARIO_ACTOR_SECRET=… pikku scenario run local --features credentialFeature
SCENARIO_ACTOR_SECRET=… pikku scenario run local --tags smoke,scenario
```

`run` takes the environment as a **required positional** — the key from `scenarios.environments`. `--flows`/`-f` filters by scenario name, `--features` by feature id, `--tags`/`-t` by tag (match-any). Every filter narrows the same plan, so narrowing a feature to two of its five scenarios still runs the feature's hooks exactly once around those two.

Output is `PASS <name> (<ms>) → <output>` / `FAIL <name> (<ms>): <error>`, then `N/M scenarios passed against '<env>'`. A scenario inside a feature is named `<Feature> › <scenario> <data>`.

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
