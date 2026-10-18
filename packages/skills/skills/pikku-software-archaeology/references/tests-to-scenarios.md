# Legacy tests -> blueprint scenarios -> Pikku scenarios

Phase 2 reads the legacy test suite as a product spec. This file covers the two hops: legacy test -> `workflows.json` `scenarios[]` (extraction), then scenario -> `pikkuScenario` (rebuild). Pikku's side is defined by the `pikku-scenario` skill (`steps.md`, `coverage.md`); read it before generating, this file only records how legacy tests meet it.

## Step 1: triage every test by kind

Not every test is a scenario. Classify first; only some become `scenarios[]`.

| Legacy test                                                                                 | Becomes in the blueprint                                 | Becomes in Pikku                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Request / feature / e2e (Rails request spec, Laravel Feature, Nest e2e, supertest)          | `scenarios[]` on the workflow, `fromTest` set            | `pikkuScenario` (`given`/`when`/`then`)                           |
| Browser journey (Playwright, Capybara, Dusk, Cypress)                                       | `scenarios[]` with a UI surface                          | `pikkuScenarioStep` with a `browser` binding, written as intent   |
| Model / validation test                                                                     | upgrades a policy or invariant to `high`, cites the test | Zod refinement + a negative step (`expectError`), or a unit test  |
| Authorization test (policy spec, "cannot see another user's invoice")                       | upgrades an authorization policy to `high`               | scenario as the owner and as another virtual user, `expectError`  |
| Job / cron / webhook test                                                                   | `scenarios[]` on the **system** workflow                 | `scenario.runScheduledTask`, or post to the webhook, then `expectEventually` |
| Pure-logic unit test (calculation, parser, state machine table)                             | an invariant, with examples                              | plain `node:test` calling `func` directly                         |
| Heavily mocked unit test (RSpec doubles, Jest DB mocks, "expects `save` called once")       | nothing: it pins the old implementation                  | drop it, and note it in `gaps.json` only if it hid a real rule    |
| Skipped / pending / commented-out test                                                      | `gaps.json` (intended behavior never finished)           | not generated                                                     |
| Snapshot test of rendered HTML or JSON                                                      | at most a weak scenario                                  | rewrite as an assertion on the outcome, not the markup            |

A rule attested by an implementation guard **and** a passing test is `high`. A scenario from a suite that does not run today is at most `medium`, because nobody has checked it still holds.

## Step 2: write scenarios as intent

Extract each test as given / when / outcome in domain language (`reads a credential nobody stored`), not as HTTP verbs or selectors. Pikku step names describe what the user wanted, in English identifiers, and the prose is third-person with no virtual user in it (the reporter supplies the subject). Keep the legacy test name in `fromTest`; do not copy its phrasing if it is a method name (`test_returns_404_for_deleted`).

One scenario per **journey**, not per function and not per test. Several legacy tests that walk the same journey with different inputs become one scenario, or entries in a `pikkuFeature` (see table-driven tests below).

## Step 3: translate the setup, because Pikku has no back door

A Pikku step runs in the CLI process and reaches the app **only over the wire as a virtual user**: `virtualUser.invoke`, `invokeRaw`, or a plain `fetch` to the target. There is no database handle, no secrets, and no state reset. Legacy tests lean on all of those, so most of the translation effort is here.

| Legacy setup                                                              | Pikku equivalent                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Factories / fixtures inserting rows directly (`factory_bot`, `Model::factory()`, `repo.save`) | `given` steps that call the app's own commands as a virtual user. **If no command can create the state, the product is missing one: record it in `gaps.json`.** |
| Clean database per test (transactions, `RefreshDatabase`, truncate)       | None. Use unique ids per run and scope what you create; `before`/`after` hooks for reset RPCs |
| Logged-in user helpers (`sign_in user`, `actingAs`, forged JWTs)          | `defineVirtualUsers`: one entry per person/role, signed in by the runner         |
| Roles built inline per test                                               | one virtual user per role actually used (`shopper`, `support`, `admin`)          |
| Frozen / travelled time (`travel_to`, `Carbon::setTestNow`, fake timers)  | Not available against a live server. Fire schedulers with `runScheduledTask`; for time-based rules, expose the rule as testable input or keep it as a unit test |
| Stubbed externals / recorded HTTP (VCR, nock, `Http::fake`, Mockery)      | stubbed services with the server in `--test` mode, asserted with `expectService`; or a mock server in the feature's `before`/`after` |
| `sleep` / waiting for the queue                                           | `expectEventually(..., { within, interval })`                                    |
| Direct DB assertions (`expect(Order.count)`, `assertDatabaseHas`)         | assert through a query the app exposes. If no query shows it, the fact is invisible to users: question whether it matters, or expose it |

## Step 4: assertions

- Every scenario must assert (PKU680): a flow of only `given`/`when` fails the inspector. Convert each legacy `expect`/`assert` into a `then`.
- A negative test (`returns 403`, `raises`, `assertForbidden`) becomes `expectError`, or `invokeRaw` when the refusal itself is the assertion. Authorization tests need two virtual users: the owner succeeds, someone else is refused.
- Do not assert on legacy status codes or response shapes unless they are part of a public contract (a documented API with outside consumers). Otherwise assert the outcome (the invoice is paid, the user sees it) and let `decisionsNeeded` record whether the old shape must be kept.
- A `then` runs every binding it declares and fails if they disagree (API says paid, browser still shows a spinner). When a legacy journey had both an API test and a browser test for the same outcome, they are witnesses of one `then`, not two scenarios.

## Table-driven tests

RSpec `shared_examples`, PHPUnit `@dataProvider` / Pest `with()`, `it.each`, `test.each`: these are Examples. In Pikku, put the cases in a `pikkuFeature` as `{ scenario, data }` entries (one run per entry) or loop the steps. Do not write a scenario per row.

## What each legacy idiom looks like

| Framework      | Where the journey tests are                                     | Idioms to translate                                                                       |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Rails          | `spec/requests`, `spec/system`, `test/integration`              | `let`/`before` blocks and `factory_bot` = setup; `travel_to` = time; `VCR` = externals    |
| Laravel        | `tests/Feature`, `tests/Browser` (Dusk)                         | `RefreshDatabase`, `actingAs`, `Queue::fake`, `Mail::fake`, `Http::fake`                  |
| NestJS         | `test/*.e2e-spec.ts` (supertest + `Test.createTestingModule`)   | `overrideProvider` = stubbed service; `beforeEach` truncate = no reset in Pikku           |
| Express        | `test/`, `__tests__` (supertest, mocha/jest)                    | `nock` = externals; DB seeded in `beforeEach`; auth via forged token helper               |

## Coverage as the acceptance check

Do not invent a parallel coverage file. Pikku already computes coverage from scenarios: run `pikku scenario run <env> --coverage` against `pikku dev --coverage` and read `<outDir>/coverage/scenario-coverage.json`. For the rebuild, the useful comparison is:

1. Every blueprint command, policy and invariant should be reachable from at least one scenario (check against the coverage output).
2. Anything uncovered either has no legacy test (record it in `gaps.json` as untested-but-critical) or its test was dropped as implementation-pinning (confirm that was deliberate).
3. The legacy suite's passing journeys should pass against the rebuild, so migrate them first and treat them as the regression bar.

Scenarios are flows and coverage is their consequence, so close gaps by extending a real journey, not by adding a scenario per function.
