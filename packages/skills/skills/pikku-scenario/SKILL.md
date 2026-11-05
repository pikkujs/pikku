---
name: pikku-scenario
description: >-
  Pikku scenarios (pikkuScenario): virtual users driving the real transport as e2e tests and health checks, Playwright steps, `pikku scenario`, `pikku virtual-user`, coverage, adversarial runs.
installGroups: [core]
---

# Pikku Scenarios

What to reach for and why. For how to call it, run this once: `pikku doc scenarios pikkuScenario TypedScenario pikkuFeature pikkuScenarioStep pikkuAgentScorer pikkuAgentJudge`.

## Agent Operating Procedure

1. Discover before editing: `pikku scenario list` for what exists, `pikku info functions --verbose` for what a scenario can call.
2. Edit source files only; never generated output or `.pikku`.
3. Validate with the narrowest relevant command first, then `pikku all --tsc` when functions, wirings or schemas may have changed. If it fails, fix the source cause and rerun.

**`pikku tests` does not exist.** It was removed in #865 — scenarios own coverage now. Any reference you find to it is stale.

## Pick the reference

This skill covers writing and running scenarios end to end. Five topics are one level down, and
each says when to open it:

| Read                             | For                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `references/steps.md`            | Authoring a `pikkuScenarioStep` — intent, witnesses, what a step is given                                                         |
| `references/browser.md`          | Browser bindings, and locating by message key in a translated app                                                                 |
| `references/virtual-users.md`    | Virtual users vs virtual users, `defineVirtualUsers`, upstream credentials for virtual users, and human sign-in as a virtual user |
| `references/coverage.md`         | Live coverage, filling it, and unit tests for pure logic                                                                          |
| `references/virtual-user-run.md` | Running a model-driven virtual user against a stage                                                                               |

## What a scenario is

A scenario is a `pikkuScenario` export that drives the app **as real virtual users over the real transport**, against a running server. That is what lets one artifact serve as both an e2e test and a staged/production health check.

Consequences that matter, and bite if ignored:

- **There is no state reset.** A scenario runs against a live server. Scope what you create (unique ids, your own rows) and never assume a clean database.
- **Every effect runs as somebody, or as a declared step.** `scenario.do(...)` without `{ virtualUser }` throws `Scenario tried to run '<rpc>' as an internal step…` — there is no bare internal-RPC step. The other way to do work is `scenario.given/when/then`, which runs a `pikkuScenarioStep`; its virtual user is optional (setup steps have none) unless it declares `browser: true`.
- **Virtual users must be configured and signed in**, or the scenario cannot run.

Scenarios live in `srcDirectories` like any other function — by convention `*.scenario.ts`.

## Writing one

`pikkuScenario` comes from the **generated** types (`#pikku/scenarios`), not `@pikku/core`. Guard the virtual users it needs at the top of `func`, and throw an error that names `pikku scenario run <environment>`.

A scenario takes the same config fields as a workflow (`title`, `description`, `tags`, `input`/`output`, `auth`, `permissions`, `middleware`, `version`, …). The third argument is the scenario context: `{ scenario, virtualUsers }`.

### The scenario API

`TypedScenario` prints the calls. `do`, `expectEventually`, `expectError`, `expectService`, `given`, `when` and `then` take `{ virtualUser }`. `expectService` needs the server run with `--test`. `then` also makes the step's bindings witnesses. `runScheduledTask(name)` fires a wired scheduler on the target now, rather than waiting for its cron.

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
  { virtualUser: virtualUsers.user }
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

A scenario config takes `before` and `after`. Both have the **same signature as `func`** — `(services, data, wire)` — with the return value discarded. A hook is usually a named function shared between scenarios, and reaches virtual users as `wire.virtualUsers`.

Neither runs when the run is suspended or waiting: teardown only fires at a terminal outcome. Hooks are **not** ladder rows: the runner records nothing for them, and a failure is labelled by phase.

A hook reaches the app the same way the body does: through `wire.virtualUsers`. If you want cleanup to be _visible_ on the ladder, make it an ordinary `scenario.then(...)` instead.

Hooks are scenario-only. A `before`/`after` on a `pikkuWorkflowFunc` never runs — a workflow is durable and resumable, so a callback that reran on every replay would have no honest meaning.

### Grouping scenarios (`pikkuFeature`)

`pikkuFeature` groups scenarios the way gherkin's `Feature:` groups `Scenario:`. Scenarios are referenced by **imported identifier**, so a renamed or deleted scenario is a compile error rather than a silent skip. `scenarios` holds bare identifiers or `{ scenario, data }` entries, and a `.map` over values works.

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

A feature is also cited by a page of the user guide: `pikku scenario guide`
fills each cited block with the feature's recordings and screenshots, and
nothing else (see **pikku-guide**). A scenario's `title` captions its recording
and a screenshot's `name` captions the still, so write both as copy a user would
read. Mark plumbing features `document: false`.

## Steps

`scenario.do` can only name an RPC. A **step** — `pikkuScenarioStep` — is a named, typed unit of
scenario behaviour whose body is an ordinary pikku function, so it can call several RPCs as its
virtual user, assert, or drive a browser. It is referenced by its typed string name (checked against the
generated step map), its body lives under a surface binding (`default` / `browser` / `cli`, never a
`func`), and one row of the report is one step.

**Read `references/steps.md` before writing one.** It carries the four things that decide whether a
suite survives its first redesign:

- **What a step is given** — a step runs in the CLI process, not where the app runs. There is no
  `kysely`, no `secrets`, and `rpc` is present but throws on purpose. Everything reaches the app
  through the virtual user.
- **Steps describe intent, not actions** — `buys the £5 strawberry milkshake`, never
  `clicks [data-testid=add]`. The clicking lives in plain utilities the step composes.
- **`then` bindings are witnesses, not alternatives** — a `then` runs _every_ binding it declares
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

Virtual users are declared in TypeScript. One `defineVirtualUsers({ … })` call for the
whole project — codegen builds the `VirtualUserId` union from it, materialises one
scenario virtual user per person, and seeds a user row each:

```ts snippet:defineVirtualUsers

```

`pikku.config.json` carries the settings around them — nothing about a person:

```json
{
  "scenarios": {
    "emailDomain": "virtualuser.example.com",
    "browserDriver": "@pikku/playwright",
    "model": "claude-sonnet-4-5"
  },
  "environments": {
    "local": {
      "apiUrl": "http://localhost:4077",
      "signInPath": "/api/auth/sign-in/virtual-user"
    }
  }
}
```

- `scenarios.emailDomain` is the mail domain virtual user addresses are built on.
- `scenarios.browserDriver` is the package driving `browser` bindings.
- `scenarios.model` is the model a virtual user thinks with (`virtualUser.converse`, `pikku virtual-user run`).
- `environments.<name>` are the targets a run can point at. The key is the required positional of `pikku scenario run`; `apiUrl` is required; `signInPath` defaults to `/auth/sign-in/virtual-user`, `rpcPath` to `/rpc`, and `sessionPath` has a default too.

**`references/virtual-users.md`** covers the parts that bite: one entry is one
person and one virtual user, emails are derived and never written, `runnable: false`
for someone only acted upon, `defineVirtualUsers` being read from source rather
than evaluated, and the same virtual user list powering a human sign-in.

- **The signing key never goes in `pikku.config.json`.** `pikku dev` creates one under `.pikku-runtime/virtual-user/`; a deployed stage's deployer holds `VIRTUAL_USER_SIGNING_KEY`. Each run signs a short-lived statement with it. `pikku scenario run` throws without a key.

## Running

```bash
pikku scenario list                       # features with their scenarios indented, then ungrouped scenarios
pikku scenario run local
pikku scenario run local --flows orderSupportScenario
pikku scenario run local --features credentialFeature
pikku scenario run local --tags smoke,scenario
pikku scenario run local --spawn --exclude-tags ai-live
```

`run` takes the environment as a **required positional** — the key from `environments`. Every filter narrows the same plan, so narrowing a feature to two of its five scenarios still runs the feature's hooks exactly once around those two.

| Flag                       | Effect                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| `--flows` / `-f`           | Comma-separated scenario names                                                    |
| `--features`               | Comma-separated feature ids                                                       |
| `--tags` / `-t`            | Match-any tag filter                                                              |
| `--exclude-tags`           | Hold tags back — unless the flow is named directly with `--flows`                 |
| `--run <surface>`          | `default` (the default), `browser`, or `cli`                                      |
| `--screenshots`            | Write asked-for screenshots under `.pikku/scenario-runs/<run>/<scenario>`         |
| `--video <mode>`           | `failed` (the default), `all`, or `off`                                           |
| `--strict`                 | Fail, rather than pass, a `then` with no witness on the run's surface             |
| `--spawn` / `--keep-alive` | Start `pikku dev` on the environment's apiUrl for the run; optionally leave it up |
| `--api-url` / `--app-url`  | Override the environment's URLs — for a target that only exists at run time       |
| `--trace`                  | Keep every stack frame on failure (default shows only the project's own)          |
| `--coverage`               | Reset/snapshot server coverage per scenario                                       |
| `--run-id <id>`            | Record the run under this id rather than a fresh one, so a caller can follow it   |

Output is `PASS <name> (<ms>) → <output>` / `FAIL <name> (<ms>): <error>`, then `N/M scenarios passed against '<env>'`. A scenario inside a feature is named `<Feature> › <scenario> <data>`.

**Exit code is 1** if any scenario fails _or_ if no scenario matched the filter — a typo'd `--flows` is a hard error, not a silent zero-run pass. It throws outright on an unknown environment, an unknown flow name, or a missing signing key.

## Coverage

Coverage is attributed by running scenarios against a server that is collecting it — it is **not**
derived from unit tests:

```bash
pikku enable scenarios                                 # sets scaffold.scenarios = true
pikku dev --coverage                                   # V8 precise coverage, in-process
pikku scenario run local --coverage
```

That writes `<outDir>/coverage/scenario-coverage.json`. **`references/coverage.md`** has the
`scaffold.scenarios` shape, why coverage silently reads zero, the four-step loop for filling a gap,
and where a plain unit test is still the right tool.

## Red flags

| Smell                                               | Why it's wrong                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.feature` files / Gherkin for function tests       | Scenarios are TypeScript, not Gherkin. There is no in-process function world.                                                                    |
| `scenario.do(...)` with no `{ virtualUser }`        | Throws. Every step runs as somebody.                                                                                                             |
| A scenario per function                             | Scenarios are user flows. One flow covers many functions; that is the point.                                                                     |
| Assuming a clean database                           | There is no state reset — it may be a staging server. Scope what you create.                                                                     |
| `sleep()` before asserting                          | Use `expectEventually`.                                                                                                                          |
| A step named `clicksAddToBasket` / `opensThePage`   | That is an action, not an intent. Name the step for what the virtual user wanted; put the clicking in a utility.                                 |
| A step named `kauftEinenApfel` / a `vorgang` table  | Identifiers are English in every project. The German belongs in `description` / `template`, and only when `pikku.config.json` sets `metaLocale`. |
| A browser step that assumes it is already on a page | It can then only run mid-flow. Arrive first — check the URL, navigate if needed.                                                                 |
| `getByLabel('Full Name')` in a translated app       | Passes only in the base locale, and a copy edit breaks it as an unexplained timeout. Locate by message key.                                      |
| A `browser` binding guarding `if (!browser)`        | The binding guarantees it. The guard hides the real error, which is a missing virtual user (`PKU677`).                                           |
| A step with a `func:` instead of a surface binding  | There is no `func` on a step. Bodies live under `default` / `browser` / `cli`; a step with none throws at load.                                  |
| `expectEventually` in a `pikkuWorkflowFunc`         | `PKU675` — scenario-only.                                                                                                                        |
| Coverage silently 0                                 | Server not run with `--coverage`, verbose functions meta not deployed, `scaffold.scenarios` unset, or no virtual users configured.               |

See `pikku-concepts` for the core mental model.
