---
name: pikku-scenario
description: >-
  Use when writing or running Pikku scenarios, or when asked to test Pikku functions or improve
  test coverage. A scenario (pikkuScenario) drives the app the way users do — steps run as actors
  over the real transport against a running server — so a flow doubles as an e2e test and a
  staged/production health check. Covers scenario.do / expectEventually / expectError /
  expectService / expectScore, declared steps via pikkuScenarioStep (including browser steps driven by
  @pikku/playwright) written as intent rather than as clicks, with the actions factored into
  shared browser utilities, actors and environments in pikku.config.json, SCENARIO_ACTOR_SECRET, the
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

### Steps describe intent, not actions

A scenario records what someone was **trying to do**, never the keystrokes they used to do it. This is the one decision that determines whether a suite survives its first redesign, and it applies to every step name you write.

| Action ladder — wrong               | Intent ladder — right                           |
| ----------------------------------- | ----------------------------------------------- |
| `Given opens /shop`                 | `Given shopper is browsing the shop`            |
| `When clicks the category filter`   | `When shopper buys the £5 strawberry milkshake` |
| `And clicks "Drinks"`               | `Then it is in their basket`                    |
| `And clicks the first product card` |                                                 |
| `And clicks Add to basket`          |                                                 |
| `Then sees "1 item"`                |                                                 |

Three things go wrong with the left-hand column, and all three are expensive:

- **A layout change rewrites every scenario that touched that screen.** In the right-hand column it rewrites one function.
- **The report is the deliverable.** `buys the £5 strawberry milkshake` is readable by someone who has never seen the app; `clicks [data-testid=add]` tells them nothing about whether the product works.
- **An action step cannot arrive on its own.** It assumes the previous click left the browser somewhere, so the scenario only runs front-to-back, as a whole, in one order.

So there are three layers, and only two of them are named in the report:

| Layer                      | What it is                             | On the ladder    |
| -------------------------- | -------------------------------------- | ---------------- |
| Scenario                   | The flow, written as intents           | yes — the ladder |
| Step (`pikkuScenarioStep`) | One intent                             | yes — one row    |
| Utility                    | An ordinary TS function over `browser` | no               |

Utilities are **not steps**. They are plain exported functions, they take the browser handle, and they hold the clicking:

```typescript
// shop.browser.ts — shared actions. Not steps: nothing here is an intent.
import type { PikkuBrowserWire } from '#pikku/scenarios'
import type {} from '@pikku/playwright'

/** Arrive on the shop, from wherever the browser happens to be. */
export const ensureOnShop = async (browser: PikkuBrowserWire) => {
  if (!new URL(browser.page.url()).pathname.startsWith('/shop')) {
    await browser.goto('/shop')
  }
  await browser
    .locate({ testId: 'product-grid' })
    .first()
    .waitFor({ state: 'visible' })
}

export const searchFor = async (browser: PikkuBrowserWire, query: string) => {
  await browser.locate({ testId: 'shop-search' }).first().fill(query)
  await browser.page.keyboard.press('Enter')
}

export const filterByCategory = async (
  browser: PikkuBrowserWire,
  category: string
) => {
  await browser.locate({ testId: 'category-filter' }).first().click()
  await browser
    .locate({ testId: 'category-option', where: { 'data-category': category } })
    .first()
    .click()
}

export const addToBasket = async (browser: PikkuBrowserWire, name: string) => {
  const card = browser
    .locate({ testId: 'product-card', containing: name })
    .first()
  await card.waitFor({ state: 'visible' })
  await card.locate('[data-testid=add-to-basket]').click()
}
```

The step composes them, and it is the step — one row — that the report shows:

```typescript
export const buysTheItem = pikkuScenarioStep<
  { name: string },
  { name: string }
>({
  name: 'buysTheItem',
  description: 'finds one item in the shop and puts it in the basket',
  template: 'buys the {name}',
  // One intent, one implementation per surface an actor can drive it through.
  browser: async (_services, { name }, { browser }) => {
    await ensureOnShop(browser)
    await searchFor(browser, name)
    await addToBasket(browser, name)
    return { name }
  },
  default: async ({ rpc }, { name }) => {
    const item = await rpc.invoke('findItemByName', { name })
    await rpc.invoke('addToBasket', { itemId: item.id })
    return { name }
  },
})
```

The bindings are **alternatives**: `pikku scenario run --run browser` clicks through the shop, `--run cli` drives it over the websocket, `--run default` (the fast suite, and the default) takes the server-side path — and all of them report the same sentence.

```typescript
await scenario.when(
  'buys a milkshake',
  'buysTheItem',
  { name: '£5 strawberry milkshake' },
  { actor: actors.shopper }
)
// reporter renders: When shopper buys the £5 strawberry milkshake  ✓  1.2s
```

**Every intent step begins by arriving.** `ensureOnShop` is not defensive noise — it is what lets a scenario start at any step, run alone, and be reordered without touching it. It checks first and navigates only if needed, so a scenario already on the shop pays nothing. This is about the _browser's_ starting position, not the database: there is still no state reset (see above), and you still scope what you create.

**The same utilities, a different intent.** A scenario about filtering has filtering as its subject, so there the filter _is_ the intent — same helper, its own step:

```typescript
export const filtersTheShop = pikkuScenarioStep<
  { category: string },
  { shown: number }
>({
  name: 'filtersTheShop',
  description: 'narrows the catalogue to one category',
  template: 'filters the shop by {category}',
  browser: async (_services, { category }, { browser }) => {
    await ensureOnShop(browser)
    await filterByCategory(browser, category)
    return {
      shown: await browser.locate({ testId: 'product-card' }).count(),
    }
  },
  default: async ({ rpc }, { category }) => ({
    shown: (await rpc.invoke('listItems', { categorySlug: category })).length,
  }),
})
```

Two scenarios, two intents, one set of utilities. That is the shape to aim for: when a helper is reused by a step whose _subject_ it is, promote it to a step there — never the reverse.

**Non-browser steps need none of this.** Without a browser there is no navigation to absorb and no DOM to hide, so an intent maps to one RPC and `scenario.do` names it directly:

```typescript
const order = await scenario.do(
  'Shopper checks out',
  'createOrder',
  { basketId, shippingAddress },
  { actor: actors.shopper }
)
```

Reach for a `pikkuScenarioStep` on the non-browser side only when one intent genuinely spans several RPCs, or when the step asserts something the RPC result alone does not say.

### What language the prose is in

A scenario carries two kinds of text, and they do not share a language.

**Identifiers are English.** The exported const (`buysAnApple`,
`credentialFeature`), the step's `name` — which is its `pikkuFuncId`, the typed
string the generated step map is keyed by — the file name, and every helper in
`*.browser.ts`. These bind to generated code and to `pikku scenario list`; they
are English in every project regardless of who the product is for or what
language the team speaks. There is no setting that changes this.

**Prose follows `metaLocale` in `pikku.config.json`** (default `en`). That is a
step's `description` and `template`, a feature's `name` and `description`, a
scenario's `title`, and the positional step names passed to
`scenario.given/when/then`. Read the field before you write any of them.

This split is the same one the feature table already states — _the export
identifier is the feature's id; `name` is the human-readable label_ — applied to
language. The report is the deliverable, and it is read by the team; the
identifier is an API, and it is read by the toolchain.

```typescript
// pikku.config.json: { "metaLocale": "de" }
export const buysAnApple = pikkuScenarioStep<{ qty: number }, { orderId: string }>({
  name: 'buysAnApple',          // identifier — English, always
  description: 'kauft einen Apfel',  // prose — follows locale
  template: 'kauft {qty} Äpfel',     // prose — follows locale
  actor: true,
  default: async (_services, { qty }, { actor }) =>
    await actor.invoke('placeOrder', { qty }),
})
```

Note what does **not** change: `placeOrder` is still `placeOrder`, and the file
is still `apple.scenario.ts`.

A product with a non-English UI is not on its own a reason to set `metaLocale` — that
is the app's language, not the team's. Ask, or leave it `en`.

**Where a non-`en` `metaLocale` still shows English, today.** The reporter composes a
sentence as `<Keyword> the <actor> <template>` (`composeStepProse`), and both the
keyword and the article `the` are English literals. The Console translates the
Given/When/Then keywords into its own UI language; the CLI reporter does not, and
nothing translates `the`. So `metaLocale: "de"` gives you German step prose inside an
English frame — `Given the shopper kauft 1 Äpfel`. Write templates that read
acceptably in that frame rather than trying to defeat it. A second gap: where a
function or scenario declares no `title`, the Console falls back to splitting the
**identifier** into an English-looking label (`toEnglishName`), so under a
non-`en` `metaLocale` meta is worth authoring rather than leaving to the fallback.

### `then` bindings are witnesses, not alternatives

This is the one place the surface bindings do **not** behave like a switch, and it is the part worth reading twice.

On a `given` or `when`, the bindings are alternatives — clicking Buy and calling `createOrder` are two ways to cause one effect, so exactly one runs.

On a `then`, they are not two implementations of one assertion. They are two _different claims_:

| binding   | what it actually proves                                        |
| --------- | -------------------------------------------------------------- |
| `default` | the order row says `paid` — the system of record is right      |
| `browser` | the confirmation panel says paid — the truth reached the human |

The gap between them is the bug nobody catches: 200 OK, database correct, user still watching a spinner. So a `then` runs **every** binding it declares and fails if they disagree.

```typescript
export const seesTheOrderConfirmed = pikkuScenarioStep<
  { orderId: string },
  { status: string }
>({
  name: 'seesTheOrderConfirmed',
  // Both bindings run as the persona, so the step declares one and the runner
  // injects `wire.actor` — non-optional in every binding.
  actor: true,
  template: 'sees order {orderId} confirmed',
  // Both run on `--run browser`. Each returns what it observed, and the runner
  // compares them — so this fails when the page disagrees with the database.
  browser: async (_services, { orderId }, { browser }) => ({
    status: await browser
      .locate({ testId: 'order-status', where: { 'data-order': orderId } })
      .getAttribute('data-status'),
  }),
  // Through the actor, not through a `rpc` service — see "What a step is given".
  default: async (_services, { orderId }, { actor }) => ({
    status: (await actor.invoke('getOrder', { orderId })).status,
  }),
})
```

Three rules follow, and they are the ones that get broken:

- **A browser witness must observe on the page.** One that quietly calls an RPC to check the result is worse than no binding at all — it reports a tick for a surface it never looked at.
- **Return what you observed, don't just assert.** A witness returning a value lets the runner diff the two. A witness that only throws still works, but it can never disagree with anything, so it proves less. Read structured state with `where` on the test-id selector rather than parsing translated copy.
- **A step with no binding for the run's surface is counted, not excused.** `--run browser` prints `n/m steps ran on browser` over _every_ step, so an action that quietly fell back to the server lowers the number just as an assertion does. A `then` that fell back is additionally named — `--strict` fails on those, because a sentence saying the actor saw something nobody looked at is a different problem from a shortcut. Not being in the UI _is_ the finding: do not add a browser binding that fakes it.

**Always give a `then` a `default` witness.** It is the floor every run can fall back to, and an assertion with no witness the run can execute is fatal (`ScenarioNoWitness`) — not a coverage gap. The distinction is the point: a `then` checked server-side under `--run browser` did happen, it just wasn't seen where the prose claims; one checked nowhere never happened at all, and without the error it would return `undefined` and render as a tick. A browser-only `then` is therefore a step that fails the fast suite, which is rarely what you want.

**Every scenario must assert.** A flow of only `given`/`when` is a PKU680 critical — it proves nothing threw. Since coverage counts every step, an assertion-free ladder of browser-bound actions would score a perfect `3/3` while checking nothing, so clicking through the UI and never looking at the result is the cheapest way to fake the number. The rule closes that.

Assertions with no possible browser witness are a different thing and should not be written as a `then`: "the audit log recorded it" is a system check, and "the receipt email arrives" is `expectEventually`, which is always out-of-band and always server-side.

### Declared steps (`pikkuScenarioStep`)

`scenario.do` can only name an RPC. A **step** is a named, typed unit of scenario behaviour whose body is an ordinary pikku function — so it can call several RPCs as its actor, assert, or drive a browser.

```typescript
import { pikkuScenarioStep } from '#pikku/scenarios'

export const buysAnApple = pikkuScenarioStep<
  { qty: number },
  { orderId: string }
>({
  name: 'buysAnApple',
  description: 'buys an apple',
  template: 'buys {qty} apples',
  actor: true,
  default: async (_services, { qty }, { actor }) => {
    return await actor.invoke('placeOrder', { qty })
  },
})
```

A step's body always lives under a **surface binding** — `default`, `browser` or
`cli` — never under a `func`. Declaring none throws at load time: at minimum give
it a `default`.

```typescript
await scenario.given(
  'buys an apple',
  'buysAnApple',
  { qty: 1 },
  { actor: actors.shopper }
)
// reporter renders: Given shopper buys 1 apples   ✓  412ms
```

Rules that bite:

- **The step is referenced by its typed string name, not by importing the const** — exactly like `workflow.do`. The name is the step's `pikkuFuncId` and is checked against the generated step map. A non-literal target is a critical error (`PKU678`).
- **Steps are not RPCs.** They are deliberately never network-callable — a browser-driving step must not be.
- **`actor.invoke` is typed over the exposed RPC map**, so the name and the payload are checked and the result comes back narrowed — no cast. `actor.invokeRaw(name, data, { headers })` is the same call reporting `{ status, ok, body }` instead of throwing; use it whenever the refusal _is_ the assertion.
- **A step that runs as somebody declares `actor: true`**, and the runner injects `wire.actor` — non-optional inside every binding, with no guard to write and nothing to unwrap. A `browser` binding implies it, because a window is opened as somebody. Leave it off for a step with no persona to be: an assertion over what an earlier step returned, or one that posts credentials precisely because it must not reuse an actor's session. Dispatching a step that declared it without `{ actor: actors.x }` fails before the body runs (`ScenarioActorRequired`); a step that did not declare it has no `actor` on its wire at all.
- **`env` is optional on the wire**, because most steps need nothing from it. Narrow it with `requireScenarioEnv(scenarioStep)` from `#pikku/scenario` rather than a local guard — it names the step and says what to pass. `env` is `{ apiUrl, appUrl? }` from the environment the run targets, and is how a raw-HTTP step learns the target's URL: a step runs in the CLI process, where there is no `variables` service and `process.env` is not the answer.
- **Steps default to `retries: 0`**, unlike ordinary workflow steps. Retrying a failed assertion is wrong; pass `retries` explicitly if a step is genuinely flaky-by-nature.
- **Step results are persisted**, so return JSON-serialisable data — never a `Locator` or a client object.
- **`description` documents the step; `template` is what the report renders.** `template`'s `{placeholders}` are filled from the input the step was called with, so one step reads differently for each call — `sees {state} addon {packageName}` reports as "sees available addon @pikku/addon-stripe". Reflect every input field in the template, and type the values so they read as words (`state?: 'installed' | 'available'`, not `installed?: boolean`). A placeholder with no value renders as nothing and the whitespace collapses.
- Prose precedence is `options.description` → the step's `template` → the step's own `description` → the positional step name. Repeated names get `#1`, `#2` ordinals, so a `for` loop over a data set is how you write a Scenario Outline. A loop-generated step name is not statically known, so it is matched back to its declaration by step function instead — which works as long as that function's call sites agree on their phase, actor and prose. Two call sites that disagree make the loop step report under its bare runtime name.

#### What a step is given

A step has the signature of an ordinary pikku function, which makes it look as
though it runs where the application runs. It does not — **it runs in the CLI
process**, and the services object is built there, by hand:

```typescript
{ logger, workflowService, workflowRunService, agentRunner? }
```

That is the whole list. There is no `kysely`, no `variables`, no `secrets`, and
none of the project's own singleton or wire services. A step that destructures
one gets `undefined` and fails on first use — `Cannot read properties of
undefined (reading 'selectFrom')` — which reads like a broken container and is
not.

`rpc` is the trap worth naming, because it is present and it throws. It is a
`guardRpc` whose every member refuses:

> Scenario tried to run 'getOrder' as an internal step. Every workflow.do in a
> scenario must carry { actor: actors.x } so it executes against 'local'.

The same guard covers `rpc.agent.run/stream/resume/approve/interrupt` and
`startWorkflow`.

This is the design, not a gap: **everything a step touches of the application
goes over the wire as somebody.** A test that could reach into the database
would be testing a different program from the one a person uses. So there are
exactly three ways in, and they are all through the actor:

- `actor.invoke(name, data)` — typed over the exposed RPC map, carrying the
  actor's session. Declare `actor: true` and destructure it off the wire.
- `.invokeRaw(name, data, { headers })` — same call, reporting
  `{ status, ok, body }`, for when the refusal is the assertion.
- a plain `fetch` against `requireScenarioEnv(scenarioStep).apiUrl`, for
  anything not an RPC — a websocket, a file upload, a webhook.

Two consequences follow, and both shape how steps get written:

- **A step cannot observe anything the app does not publish.** If a test needs a
  fact the client never sees, the fix is to emit it on the stream or expose it
  as an RPC — which usually improves the product, since a client debugging the
  same problem needed it too.
- **`agentRunner` is conditional.** It is built only when the project declares
  agents, and `createDevAgentRunner` needs a base URL *and* a key together
  (`OPENAI_BASE_URL` + `OPENAI_API_KEY`, or the LiteLLM pair). With a key alone
  it returns nothing and `agentRunner` is `undefined`, so `actor.converse`
  fails before the persona says anything. A suite that would rather own its own
  model can pass an `llm` to `runConversation` instead of relying on this one.

### Browser steps

Declaring a `browser` binding is the whole switch: inside that binding `wire.browser` is guaranteed present and non-optional, and a step without one never sees a browser at all. There is nothing to null-check.

A `browser` binding gets a session bound to **its actor**, signed in through the same `signInPath` + `SCENARIO_ACTOR_SECRET` path the HTTP actors use, so the browser and the RPC calls are one identity. Calling such a step without an actor is a critical error (`PKU677`).

Browser steps are where **intent, not actions** earns its keep: the step is one intent, the clicking lives in shared utilities, and the step arrives before it acts. Write the mechanics below into utilities and keep the step body to three or four calls that read as a sentence.

```typescript
export const opensTheCart = pikkuScenarioStep<
  { path: string },
  { url: string }
>({
  name: 'opensTheCart',
  description: 'opens the cart',
  browser: async (_services, { path }, { browser }) => {
    await browser.goto(path)
    return { url: browser.page.url() }
  },
  default: async (_services, _data, { actor }) => ({
    url: (await actor.invoke('getCart', {})).url,
  }),
})
```

- Install `@pikku/playwright` and `@playwright/test`, and import `@pikku/playwright` once (`import type {} from '@pikku/playwright'`) so `browser.page` is a typed Playwright `Page`. Without it you still get the structural `goto`/`screenshot` handle.
- The environment needs an `appUrl` beside its `apiUrl`. `pikku scenario run` fails fast before running anything if a browser scenario has no `appUrl` or the driver is not installed.
- `pikku scenario run <env> --no-browser` **skips** scenarios containing browser steps and reports them as skipped — it does not fail them. That is how a machine with no browser stays green.
- Playwright auto-waits; do not wrap `page.click` in `expectEventually`.

#### Locate by message key, never by rendered copy

If the app is translated, **no step may contain a user-visible string.** `getByLabel('Full Name')` passes only while the browser happens to render the base locale, and any copy edit turns it into a selector timeout that points at the wizard rather than at the rename that caused it — the test looks broken where it is merely stale.

The message catalogue already holds the string under a key. Read it from there. Type the lookup off the catalogue JSON so a renamed or misspelled key is a **compile** error rather than a run-time timeout:

```typescript
// tests/scenarios/i18n.ts
import type messages from '../../../../apps/web/messages/en.json'

export type MessageKey = keyof typeof messages

export const t = (key: MessageKey, locale = baseLocale): string => { /* … */ }
```

```typescript
await page.getByLabel(t('jobs_apply_fullname')).fill(identity.name)
await page.getByRole('button', { name: t('jobs_apply_submit'), exact: true }).click()
```

- Type off `messages/<baseLocale>.json`, **not** the generated Paraglide output — `i18n/paraglide/` is build output, so typing against it makes the tests unbuildable until the app has been built. The JSON is the tracked source.
- Fall back to the base locale for a key a locale has not translated. That is what Paraglide does at run time, so a helper that throws instead would disagree with the screen the test is looking at.
- This is not only about locators. A copy literal passed to a **project helper** (`pick('Where would you like to work?', …)`) reaches the DOM the same way, and so does a pane name quoted back in a failure message. `pikku fabric validate` scans every string in a `*.steps.ts` / `*.scenario.ts` against the base catalogue and errors on any verbatim match, wherever it sits — except comments, and the `name` / `description` / `template` declared directly on a `pikkuFeature`, `pikkuScenario` or `pikkuScenarioStep`, which are Console meta written in the project's `locale` rather than app copy.
- A regex locator (`{ name: /^Next$/i }`) hides the literal but not the problem. `{ name: t('key'), exact: true }` is both stricter and locale-correct.
- Strings the catalogue does not own — a test id, a fixture filename, a seeded value — stay literal. The catalogue is the test for whether something is copy.

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

### Personas and actors

A **persona** is a kind of person; an **actor** is one body that signs in as one. Above, `support` is declared only as a persona — its actor is materialised (`support@actors.local`), so `actors.support` works without an `actors` entry. Write an actor by hand only when you need something the materialised one wouldn't have:

- a **real email or personality** for it, like `shopper`;
- a **second body of the same persona**, like `shopperB` — which is what tenant isolation, peer sharing, and "another member's row" scenarios are made of. Two actors of one persona must be two different users, so **two actors sharing an email is an error**.

A persona holds only what is true of that kind of person for the app's whole lifetime — `description`, `primary` (whose experience the product is), `kind`, `proficiency`. What someone is trying to get done, and the circumstances they are doing it in, belong to the **scenario**, not to them.

`kind: "system"` is the app acting on its own — a schedule, a cleanup, a send. It gets **no actor**: there is nobody to sign in. Give it one by hand only if it genuinely has a service account.

#### Declaring personas in TypeScript

`definePersonas({ … })` is the code form of the block above, and there may be
**one call in the whole codebase** — one place to read the set from, one place
to add to it. A second anywhere, including in the same file, is a critical.
Generated files are exempt and never claim the slot.

> [!WARNING]
> The declaration is **read from source, never evaluated** — the CLI writes it
> to JSON that a deployed stage carries without the app. So every value has to
> be statically knowable, and a value that is not comes out as `undefined`
> rather than as an error. Only `name` is checked, so a computed `personality`,
> `jobTitle` or `description` is dropped in silence and the persona runs with a
> blank temperament.

What that admits and what it does not:

```typescript
personality: 'Wound up and short with it.'      // read
personality: `Wound up and short with it.
  Says what she wants in a few blunt words.`    // read — no ${} in it
personality: 'Wound up. ' + 'Short with it.'    // dropped, silently
personality: TEMPERAMENTS.impatient             // dropped, silently
```

A no-substitution template literal is a string literal as far as the reader is
concerned, so it is the way to write a long personality across several lines —
not a concatenation, and not a `prettier-ignore`d single line. Its newlines and
leading indentation are kept verbatim and reach the model that way, which is
harmless but worth knowing before you align it to the surrounding code.

One more thing worth knowing before writing a rich persona: **`actor.converse`
builds its prompt from `name`, `jobTitle`, `personality` and the scenario's
`task` only.** Fields like `disposition`, `goals` and `roles` are read and
stored, and the console shows them, but they do not reach the conversing
persona's instructions. Anything that must shape how someone talks belongs in
`personality` or in the task.

An actor with no `persona` is its own persona, so a project that never declares any keeps working unchanged.

- `environments.<name>.apiUrl` is required. `signInPath` defaults to `/auth/sign-in/actor`, `rpcPath` to `/rpc`.
- **`SCENARIO_ACTOR_SECRET` is an environment variable and never goes in `pikku.config.json`.** It signs actors in. `pikku scenario run` throws without it; a server auto-building actors warns and runs without them.

### The same actors sign a human in

Declared actors are not only for automated runs. `signInPath` is Better Auth's
`actor` plugin (see `pikku-better-auth`, a separate install), which any caller can post to — so the
frontend gets a one-click "Sign in as …" switcher over the **same** list, and an
app can be reviewed as each kind of user without anyone knowing a seed password.

The sandbox dev server bakes both halves into the frontend from the declared
personas: `VITE_DEV_ACTORS` (the JSON actor list) and `VITE_DEV_ACTOR_SECRETS`
(`{ email: credential }`, one per persona — `SCENARIO_ACTOR_SECRET` itself never
goes in a bundle; see **pikku-better-auth**). Neither var is set in a production
build, so the control renders nothing there — but gate the reads on your
bundler's dev flag anyway (`import.meta.env.DEV ? … : undefined`) so no
credential reaches a production bundle in the first place.

Do not hand-roll the switcher: `useDevActors()` (`pikku-react`, a separate install) is the logic and
`<DevActorSwitcher />` from `@pikku/mantine/dev` is a ready rendering of it.
`pikku fabric validate` **requires** any frontend with a login screen to ship
one — without it a reviewer is locked out of their own sandbox.

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

| Smell                                               | Why it's wrong                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pikku tests …`                                     | Removed in #865. Use `pikku scenario`.                                                                                      |
| `.feature` files / Gherkin for function tests       | Scenarios are TypeScript, not Gherkin. The in-process cucumber function world was deleted.                                  |
| `scenario.do(...)` with no `{ actor }`              | Throws. Every step runs as somebody.                                                                                        |
| A scenario per function                             | Scenarios are user flows. One flow covers many functions; that is the point.                                                |
| Assuming a clean database                           | There is no state reset — it may be a staging server. Scope what you create.                                                |
| `sleep()` before asserting                          | Use `expectEventually`.                                                                                                     |
| A step named `clicksAddToBasket` / `opensThePage`   | That is an action, not an intent. Name the step for what the actor wanted; put the clicking in a utility.                   |
| A step named `kauftEinenApfel` / a `vorgang` table   | Identifiers are English in every project. The German belongs in `description` / `template`, and only when `pikku.config.json` sets `metaLocale`.  |
| A browser step that assumes it is already on a page | It can then only run mid-flow. Arrive first — check the URL, navigate if needed.                                            |
| `getByLabel('Full Name')` in a translated app        | Passes only in the base locale, and a copy edit breaks it as an unexplained timeout. Locate by message key.                 |
| A `browser` binding guarding `if (!browser)`        | The binding guarantees it. The guard hides the real error, which is a missing actor (`PKU677`).                             |
| A step with a `func:` instead of a surface binding  | There is no `func` on a step. Bodies live under `default` / `browser` / `cli`; a step with none throws at load.             |
| `expectEventually` in a `pikkuWorkflowFunc`         | `PKU675` — scenario-only.                                                                                                   |
| Coverage silently 0                                 | Server not run with `--coverage`, verbose functions meta not deployed, `scaffold.scenarios` unset, or no actors configured. |

`@pikku/cucumber` is a **browser/e2e** harness (`Actor`, `BrowserWorld`, `PersonaData`, `DbUtils`) — out of scope here.

See `pikku-concepts` for the core mental model.
