---
name: pikku-scenario
description: >-
  Use when writing or running Pikku scenarios, running a persona as a virtual user, or when
  asked to test Pikku functions or improve coverage. A scenario (pikkuScenario) drives the app
  the way users do — steps run as actors over the real transport against a running server — so a
  flow doubles as an e2e test and a staged/production health check. Covers scenario.do /
  expectEventually / expectError / expectService / expectScore, declared steps via
  pikkuScenarioStep (browser steps driven by @pikku/playwright) written as intent rather than
  clicks, personas / actors / environments in pikku.config.json, SCENARIO_ACTOR_SECRET, the
  `pikku scenario list|run` and `pikku persona run|list|sync|secret` commands, and live coverage
  via `pikku dev --coverage`. TRIGGER when: user asks about scenarios, testing a Pikku function,
  coverage, e2e flows, browser/UI e2e, health checks, personas, virtual users, or adversarial
  runs against a stage. DO NOT TRIGGER when: user asks about running an existing suite (use
  Bash) or CI config.
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

## Pick the reference

This skill covers writing and running scenarios end to end. Four topics are one level down, and
each says when to open it:

| Read                        | For                                                                       |
| --------------------------- | ------------------------------------------------------------------------- |
| `references/steps.md`       | Authoring a `pikkuScenarioStep` — intent, witnesses, what a step is given |
| `references/browser.md`     | Browser bindings, and locating by message key in a translated app         |
| `references/personas.md`    | Personas vs actors, `definePersonas`, and the human "Sign in as …" switcher |
| `references/coverage.md`    | Live coverage, filling it, and unit tests for pure logic                  |
| `references/persona-run.md` | Running a persona as a model-driven virtual user against a stage          |

## What a scenario is

A scenario is a `pikkuScenario` export that drives the app **as real actors over the real transport**, against a running server. That is what lets one artifact serve as both an e2e test and a staged/production health check.

Consequences that matter, and bite if ignored:

- **There is no state reset.** A scenario runs against a live server. Scope what you create (unique ids, your own rows) and never assume a clean database.
- **Every effect runs as somebody, or as a declared step.** `scenario.do(...)` without `{ actor }` throws `Scenario tried to run '<rpc>' as an internal step…` — there is no bare internal-RPC step. The other way to do work is `scenario.given/when/then`, which runs a `pikkuScenarioStep`; its actor is optional (setup steps have none) unless it declares `browser: true`.
- **Actors must be configured and signed in**, or the scenario cannot run.

Scenarios live in `srcDirectories` like any other function — by convention `*.scenario.ts`.

## Writing one

`pikkuScenario` comes from the **generated** workflow types, not `@pikku/core`:

```typescript
import { pikkuScenario } from '#pikku/scenarios'

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

| Call                                                                                 | Purpose                                                                                                                |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `scenario.do(step, rpc, data, { actor })`                                            | Run an RPC as that actor. The step name is what appears in the run output.                                             |
| `scenario.expectEventually(step, rpc, data, predicate, { actor, within, interval })` | Poll until `predicate(out)` passes or `within` elapses. For anything asynchronous — queues, workers, eventual state.   |
| `scenario.expectError(step, rpc, data, { actor, matches })`                          | Assert the call **fails**. For fault injection and negative paths.                                                     |
| `scenario.expectService(step, 'service.method', { actor, calledWith })`              | Assert a stubbed service was called. Requires the server to run with `--test`.                                         |
| `scenario.expectScore(step, runId, scorer, { atLeast, atMost, reference })`          | Grade a finished agent run with a declared scorer and assert the score. See below.                                     |
| `scenario.given(stepName, step, data, { actor })`                                    | Run a declared `pikkuScenarioStep` as setup. `when` is the same call; `then` also makes the step's bindings witnesses. |
| `scenario.runScheduledTask(name)`                                                    | Fire a wired scheduler on the target now, rather than waiting for its cron.                                            |

`expectEventually` is **scenario-only**. Calling it from a `pikkuWorkflowFunc` is a critical inspector error (`PKU675`) pointing you at `pikkuScenario`.

Prefer `expectEventually` over sleeping.

### Asserting on an agent's answer (`expectScore`)

An agent's output is not comparable to a fixed string, so it is graded rather
than matched. Declare the rubric with `pikkuAgentScorer` (grades in code) or
`pikkuAgentJudge` (grades with a model) in a `*.scorer.ts` file, name it on the
agent's `scorers`, then assert on the run the scenario just triggered:

```typescript
const { runId } = await scenario.when(
  'asks for a summary',
  'runAssistant',
  {
    prompt: data.prompt,
  },
  { actor: actors.user }
)

await scenario.expectScore('answered briefly', runId, 'brevity', {
  atLeast: 0.8,
})
```

The default bound is `atLeast: 0.5`, so an unqualified `expectScore` still fails
a run the scorer graded zero. `atMost` is for a rubric where high is the failure
(sycophancy, verbosity). `reference` supplies the answer key a
`requiresReference` judge grades against — live traffic has none, so such a
judge is only ever reachable from a scenario.

Grading goes through the `pikkuScenarioGradeRun` instrumentation RPC on the
server under test, which grades from the snapshot the runtime kept at the end of
the run. Two consequences: the run must have happened on **that** server and be
recent, and the grade is returned to the scenario rather than recorded — a
test's score never lands among the production figures. Sampling is ignored, so a
scorer set to grade 1% of live traffic still grades every scenario run.

Tag any scenario whose scorer is a judge `ai-live`: it costs a model call, and
the default suite excludes it.

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
  func: async (services, data, { scenario, actors }) => {
    /* … */
  },
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

A hook reaches the app the same way the body does: through `wire.actors`. If you want cleanup to be _visible_ on the ladder, make it an ordinary `scenario.then(...)` instead.

Hooks are scenario-only. A `before`/`after` on a `pikkuWorkflowFunc` never runs — a workflow is durable and resumable, so a callback that reran on every replay would have no honest meaning.

### Grouping scenarios (`pikkuFeature`)

`pikkuFeature` groups scenarios the way gherkin's `Feature:` groups `Scenario:`. Scenarios are referenced by **imported identifier**, so a renamed or deleted scenario is a compile error rather than a silent skip:

```typescript
import { pikkuFeature } from '#pikku/scenarios'
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

| Rule                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------- |
| The **export identifier is the feature's id**; `name` is the human-readable label. Both must be exported or the build fails.                  |
| A `{ scenario, data }` entry is gherkin's `Examples:` — one run per entry. `data` is typed against that scenario's input.                     |
| Feature hooks run **once around the whole group** (`before → a → b → c → after`), _not_ per scenario. `after` runs in a `finally`.            |
| There is deliberately **no `Background:`**. Per-scenario setup is the scenario's own `before`, referencing a shared function.                 |
| A scenario's effective tags are its own **plus** the feature's, so `--tags credential` selects through the feature.                           |
| A scenario need not belong to a feature — one with no input still runs standalone.                                                            |
| Membership is resolved by **object identity** at runtime, which is why a loop works and why a scenario built inline in a feature is an error. |

The **feature is the run unit**: `--flows` on a scenario whose every feature entry carries `data` errors and names the features containing it, because the feature is what supplies that data. Use `--features` for those. A scenario referenced bare anywhere, or in no feature at all, still runs standalone.

## Steps

`scenario.do` can only name an RPC. A **step** — `pikkuScenarioStep` — is a named, typed unit of
scenario behaviour whose body is an ordinary pikku function, so it can call several RPCs as its
actor, assert, or drive a browser. It is referenced by its typed string name (checked against the
generated step map), its body lives under a surface binding (`default` / `browser` / `cli`, never a
`func`), and one row of the report is one step.

**Read `references/steps.md` before writing one.** It carries the four things that decide whether a
suite survives its first redesign:

- **What a step is given** — a step runs in the CLI process, not where the app runs. There is no
  `kysely`, no `secrets`, and `rpc` is present but throws on purpose. Everything reaches the app
  through the actor.
- **Steps describe intent, not actions** — `buys the £5 strawberry milkshake`, never
  `clicks [data-testid=add]`. The clicking lives in plain utilities the step composes.
- **`then` bindings are witnesses, not alternatives** — a `then` runs *every* binding it declares
  and fails when they disagree, because "database right, user still watching a spinner" is the bug
  nobody catches.
- **What language the prose is in** — identifiers are English in every project; `description`,
  `template` and step names follow `metaLocale`.

Browser bindings, and locating by message key rather than rendered copy, are in
`references/browser.md`.

**Every scenario must assert.** A flow of only `given`/`when` is a PKU680 critical — it proves
nothing threw. Coverage counts every step, so an assertion-free ladder of browser actions would
score a perfect run while checking nothing.

## Configuration

Personas, actors and environments live in `pikku.config.json`:

```json
{
  "scenarios": {
    "personas": {
      "shopper": { "description": "Buys things here", "primary": true },
      "support": {
        "description": "Answers for the shop",
        "proficiency": "power"
      },
      "reminders": {
        "description": "The shop chasing abandoned carts",
        "kind": "system"
      }
    },
    "actors": {
      "shopper": {
        "email": "shopper@actors.local",
        "name": "Shopper",
        "jobTitle": "First-time buyer",
        "personality": "Impatient shopper who abandons slow checkouts"
      },
      "shopperB": { "persona": "shopper", "email": "shopper-b@actors.local" }
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

**`references/personas.md`** covers the parts that bite: a persona is a
kind of person and an actor is one body signing in as one, when to write an
actor by hand, `kind: "system"` having no actor, `definePersonas` being read
from source rather than evaluated, and the same actor list powering a human
"Sign in as …" switcher.

- `environments.<name>.apiUrl` is required. `signInPath` defaults to `/auth/sign-in/actor`, `rpcPath` to `/rpc`.
- **`SCENARIO_ACTOR_SECRET` is an environment variable and never goes in `pikku.config.json`.** It signs actors in. `pikku scenario run` throws without it; a server auto-building actors warns and runs without them.

## Running

```bash
pikku scenario list                       # features with their scenarios indented, then ungrouped scenarios
SCENARIO_ACTOR_SECRET=… pikku scenario run local
SCENARIO_ACTOR_SECRET=… pikku scenario run local --flows orderSupportScenario
SCENARIO_ACTOR_SECRET=… pikku scenario run local --features credentialFeature
SCENARIO_ACTOR_SECRET=… pikku scenario run local --tags smoke,scenario
SCENARIO_ACTOR_SECRET=… pikku scenario run local --spawn --no-browser --exclude-tags ai-live
```

`run` takes the environment as a **required positional** — the key from `environments`. Every filter narrows the same plan, so narrowing a feature to two of its five scenarios still runs the feature's hooks exactly once around those two.

| Flag                       | Effect                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| `--flows` / `-f`           | Comma-separated scenario names                                                    |
| `--features`               | Comma-separated feature ids                                                       |
| `--tags` / `-t`            | Match-any tag filter                                                              |
| `--exclude-tags`           | Hold tags back — unless the flow is named directly with `--flows`                 |
| `--run <surface>`          | `default` (the default), `browser`, or `cli`                                      |
| `--no-browser`             | Shorthand for `--run default`; scenarios with browser steps report as **skipped** |
| `--strict`                 | Fail, rather than pass, a `then` with no witness on the run's surface             |
| `--spawn` / `--keep-alive` | Start `pikku dev` on the environment's apiUrl for the run; optionally leave it up |
| `--api-url` / `--app-url`  | Override the environment's URLs — for a target that only exists at run time       |
| `--trace`                  | Keep every stack frame on failure (default shows only the project's own)          |
| `--coverage`               | Reset/snapshot server coverage per scenario                                       |

Output is `PASS <name> (<ms>) → <output>` / `FAIL <name> (<ms>): <error>`, then `N/M scenarios passed against '<env>'`. A scenario inside a feature is named `<Feature> › <scenario> <data>`.

**Exit code is 1** if any scenario fails _or_ if no scenario matched the filter — a typo'd `--flows` is a hard error, not a silent zero-run pass. It throws outright on an unknown environment, an unknown flow name, or a missing `SCENARIO_ACTOR_SECRET`.

## Coverage

Coverage is attributed by running scenarios against a server that is collecting it — it is **not**
derived from unit tests:

```bash
pikku enable scenarios                                 # sets scaffold.scenarios = true
pikku dev --coverage                                   # V8 precise coverage, in-process
SCENARIO_ACTOR_SECRET=… pikku scenario run local --coverage
```

That writes `<outDir>/coverage/scenario-coverage.json`. **`references/coverage.md`** has the
`scaffold.scenarios` shape, why coverage silently reads zero, the four-step loop for filling a gap,
and where a plain unit test is still the right tool.

## Red flags

| Smell                                               | Why it's wrong                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pikku tests …`                                     | Removed in #865. Use `pikku scenario`.                                                                                                           |
| `.feature` files / Gherkin for function tests       | Scenarios are TypeScript, not Gherkin. The in-process cucumber function world was deleted.                                                       |
| `scenario.do(...)` with no `{ actor }`              | Throws. Every step runs as somebody.                                                                                                             |
| A scenario per function                             | Scenarios are user flows. One flow covers many functions; that is the point.                                                                     |
| Assuming a clean database                           | There is no state reset — it may be a staging server. Scope what you create.                                                                     |
| `sleep()` before asserting                          | Use `expectEventually`.                                                                                                                          |
| A step named `clicksAddToBasket` / `opensThePage`   | That is an action, not an intent. Name the step for what the actor wanted; put the clicking in a utility.                                        |
| A step named `kauftEinenApfel` / a `vorgang` table  | Identifiers are English in every project. The German belongs in `description` / `template`, and only when `pikku.config.json` sets `metaLocale`. |
| A browser step that assumes it is already on a page | It can then only run mid-flow. Arrive first — check the URL, navigate if needed.                                                                 |
| `getByLabel('Full Name')` in a translated app       | Passes only in the base locale, and a copy edit breaks it as an unexplained timeout. Locate by message key.                                      |
| A `browser` binding guarding `if (!browser)`        | The binding guarantees it. The guard hides the real error, which is a missing actor (`PKU677`).                                                  |
| A step with a `func:` instead of a surface binding  | There is no `func` on a step. Bodies live under `default` / `browser` / `cli`; a step with none throws at load.                                  |
| `expectEventually` in a `pikkuWorkflowFunc`         | `PKU675` — scenario-only.                                                                                                                        |
| Coverage silently 0                                 | Server not run with `--coverage`, verbose functions meta not deployed, `scaffold.scenarios` unset, or no actors configured.                      |

`@pikku/cucumber` is a **browser/e2e** harness (`Actor`, `BrowserWorld`, `PersonaData`, `DbUtils`) — out of scope here.

See `pikku-concepts` for the core mental model.
