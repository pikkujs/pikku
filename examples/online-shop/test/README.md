# test — end-to-end scenarios (pikku scenarios + Playwright)

Scenarios run against the **live app** — the sandbox dev server, or a local
`bun run dev`. They are discovered by `pikku` because `packages/functions/test`
is in `srcDirectories`, so a `*.feature.ts` here needs no registration.

Run them:

```sh
SCENARIO_ACTOR_SECRET=... bunx pikku scenario run local
SCENARIO_ACTOR_SECRET=... bunx pikku scenario run local --features pagesFeature
SCENARIO_ACTOR_SECRET=... bunx pikku scenario run local --tags smoke
SCENARIO_ACTOR_SECRET=... bunx pikku scenario run local --no-browser   # API scenarios only
```

`--features` takes the **export name** (`pagesFeature`), not the display name.
`pikku scenario list` prints every feature, scenario and its resolved data —
run it after `pikku all`, which is what actually generates them.

## The two tiers

**`smoke` — the build gate (mutationless).** Read-only checks that run against
the already-running app on every build. They sign in and navigate, nothing
more, so they are safe against the normal server.

- `scenarios/auth.feature.ts` — a signed-in session reaches the gated `/app`
  and the server agrees who it is.
- `scenarios/pages.feature.ts` — every static route renders with no HTTP error,
  no failed or 5xx app API call, no uncaught exception, and no console error.
  Routes come from the generated route tree, so new pages are swept
  automatically.

**Everything else — behaviour scenarios (mutating).** Create/edit/delete flows
and permission checks. Because they mutate state they must be deterministic:
give them their own data, uniquely named per run (`Date.now().toString(36)` and
some randomness), since nothing resets between scenarios. Do **not** tag them
`smoke`.

## Actors, and what they change

The runner opens one BrowserContext per actor and signs each in at
`signInPath` **before** the first step. So:

- There is no signed-out state. A gherkin-style "logs in through the form"
  scenario has nothing to drive — assert the outcome (admitted to the gated
  area) instead, as `auth.feature.ts` does.
- A scenario that _creates_ an identity clears the context first
  (`browser.context.clearCookies()`), because signing up while another user's
  cookie is attached is refused outright.
- One actor exists per persona declared with `definePersonas` (see
  `src/personas.ts`); pikku derives each address from the persona id. The secret
  is **never** in that file: it is `SCENARIO_ACTOR_SECRET` in the environment,
  and its absence disables `/api/auth/sign-in/actor` entirely. That absence is
  what keeps the door shut in production.

## Writing a scenario

The body is parsed statically to build the run graph, so it is a narrow subset
of TypeScript:

- The data parameter must be a plain named identifier — no destructuring.
- `for...of` may only walk an array that arrived in `data`.
- The actor must be written literally as `actors.<name>`; you cannot
  parameterise a scenario by role. One scenario per role instead.
- No `try`/`catch`.

Violations are codegen diagnostics (PKU677/PKU679), and an unextracted scenario
registers as _empty_ and passes vacuously — so always read the diagnostics from
`pikku all` before trusting a green run.

State is the return value: a step returns JSON, and later steps are handed it
explicitly. Never return a Playwright `Locator` or `Page`.

## Extending

Add `scenarios/<domain>.feature.ts`, plus `scenarios/<domain>.steps.ts` if it
needs verbs the generic ones don't cover. Keep `scenarios/browser.steps.ts`
generic. Failure screenshots land in `.pikku/scenario-failures/` — read them
before believing an error message.
