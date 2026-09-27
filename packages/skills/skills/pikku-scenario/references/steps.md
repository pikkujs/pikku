# Writing steps

A `pikkuScenarioStep` is the unit a scenario's ladder is made of. Everything here is about
authoring one well, because a step is the thing that survives — or does not survive — the app's
first redesign.

1. [What a step is](#what-a-step-is)
2. [What a step is given](#what-a-step-is-given)
3. [Steps describe intent, not actions](#steps-describe-intent-not-actions)
4. [`then` bindings are witnesses, not alternatives](#then-bindings-are-witnesses-not-alternatives)
5. [What language the prose is in](#what-language-the-prose-is-in)

Browser bindings have their own file: **`references/browser.md`**.

---

## What a step is

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
- **Never write the actor into the prose.** The reporter renders the actor as the sentence's subject, so a step authored as `` `'sam' creates the client` `` run as `{ actor: actors.sam }` reads "Given sam 'sam' creates the client" — and the hardcoded name desyncs the moment the call site changes actor. Write a bare third-person predicate (`creates the {name} client`) and let the actor supply the subject. Prose that opens with its own actor's key — quoted, capitalised or possessive — is `PKU681`; naming someone **else** mid-sentence ("sends nadia an invite") is ordinary prose and is left alone, as is an actor keyed after a role noun used as a noun ("creates the admin client" as `actors.admin`).
- Prose precedence is `options.description` → the step's `template` → the step's own `description` → the positional step name. Repeated names get `#1`, `#2` ordinals, so a `for` loop over a data set is how you write a Scenario Outline. A loop-generated step name is not statically known, so it is matched back to its declaration by step function instead — which works as long as that function's call sites agree on their phase, actor and prose. Two call sites that disagree make the loop step report under its bare runtime name.

## What a step is given

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
  agents, and `createDevAgentRunner` needs a base URL _and_ a key together
  (`OPENAI_BASE_URL` + `OPENAI_API_KEY`, or the LiteLLM pair). With a key alone
  it returns nothing and `agentRunner` is `undefined`, so `actor.converse`
  fails before the persona says anything. A suite that would rather own its own
  model can pass an `llm` to `runConversation` instead of relying on this one.
---

## Steps describe intent, not actions

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
---

## `then` bindings are witnesses, not alternatives

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
---

## What language the prose is in

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
export const buysAnApple = pikkuScenarioStep<
  { qty: number },
  { orderId: string }
>({
  name: 'buysAnApple', // identifier — English, always
  description: 'kauft einen Apfel', // prose — follows locale
  template: 'kauft {qty} Äpfel', // prose — follows locale
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
sentence as `<Keyword> <actor> <template>` (`composeStepProse`), and the keyword is
an English literal. The Console translates the Given/When/Then keywords into its own
UI language; the CLI reporter does not, so `metaLocale: "de"` gives you German step
prose inside an English frame — `Given shopper kauft 1 Äpfel`. Write templates that read
acceptably in that frame rather than trying to defeat it. A second gap: where a
function or scenario declares no `title`, the Console falls back to splitting the
**identifier** into an English-looking label (`toEnglishName`), so under a
non-`en` `metaLocale` meta is worth authoring rather than leaving to the fallback.