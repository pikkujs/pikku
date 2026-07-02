# @pikku/cucumber

## 0.12.7

### Patch Changes

- 105f5fd: Add `@pikku/cucumber/browser` — a universal Playwright browser-test harness so
  projects (and build agents) write only `.feature` files, never step code.
  - Third-person actor grammar via a `{actor}` Cucumber parameter type: a quoted
    persona name (`"the admin"`) creates/reuses an actor with its OWN browser
    context (window, cookie jar, session); `they` resolves to the last-referenced
    actor. The transformer resolves straight to the `ActorSession`. Multi-actor
    scenarios (realtime: one actor publishes, another sees it live) work out of
    the box.
  - A Mantine-aware step vocabulary mapping to component families: `click(s)`,
    `fill(s)` (+ table form), `turn(s) on/off` (Switch/Checkbox/Chip),
    `select(s) … from` (Select/Autocomplete), `choose(s) … in`
    (Radio/SegmentedControl), `pick(s) date`, `upload(s)`, `switch(es) to the …
tab`, row-scoped steps, `confirm(s)`/`dismiss(es)` (Modal + native dialogs),
    notification/table/URL/text assertions, and a `wait(s) until they see`
    long-poll.
  - An element registry (`elements.json`, meant to be generated from the app's
    data-testids): per-kind `name → selector` maps (buttons/fields/links/tabs/
    tables/menus) resolved first, with Mantine heuristics (testid → role/label →
    placeholder → text) as fallback.
  - Smoke built-ins: `a test account exists`, `sign(s) in through the login
form`, `land(s) on the app`, and the `every page loads without errors` route
    sweep (TanStack route-tree enumeration, per-page console/pageerror/failed-
    request/API-error collection, transient-aware retries).
  - Better Auth session bootstrap per actor (`is/are signed in`), personas from
    `E2E_PERSONAS` or derived deterministically from the actor name, and a
    data-reset bridge (`the app data is reset`) for a dev-only reset RPC.

  Consumers pass their cucumber API in (`registerBrowserSteps({ Given, When,
Then, defineParameterType })`, `registerBrowserHooks({ Before, After })`) —
  the package depends only on `@playwright/test` (optional peer).

## 0.12.6

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44
  - @pikku/fetch@0.12.6

## 0.12.5

### Patch Changes

- 25a1f6d: Make the function-test harness work for monorepo + engine-aware projects:
  - `@pikku/addon-console`: the Run-tests and coverage handlers now resolve the
    functions dir robustly (`<root>/packages/functions` when present), and
    `getFunctionCoverage` reads the actual coverage output path
    (`tests/.coverage/function-coverage.json`) instead of a stale
    `function-tests/coverage/...` path — so the console's coverage button works in
    monorepo sandboxes.
  - `@pikku/cli`: `pikku tests init` now detects the db engine (`db/sqlite` /
    `db/postgres`) and points the harness at the correct migrations + seed
    (`db/<engine>` + `db/<engine>-seed.sql`) instead of the hardcoded
    `db/migrations`. It also scaffolds a green starter `example.feature` and an
    empty `yarn.lock` (so the standalone tests package installs under Yarn Berry).
    Postgres harness support is tracked in #758.
  - `@pikku/cucumber`: `createDbUtils.buildBaseDb` tolerates a missing/empty
    migrations dir or seed file instead of crashing on `scandir('')`.

- Updated dependencies [f6adc1c]
- Updated dependencies [ade6f0b]
  - @pikku/core@0.12.36
  - @pikku/fetch@0.12.4

## 0.12.4

### Patch Changes

- a027a8e: fix: typed secret/variables access in Better Auth factories + cucumber Actor cookie jar
  - **cli**: the generated `#pikku` `pikkuBetterAuth` wrapper now substitutes the
    project's generated `TypedSecretService` / `TypedVariablesService` for the base
    `secrets` / `variables` services (typed and wrapped at runtime, the same way
    addon services are). The auth factory can read provider secrets straight off
    the generated `CredentialsMap` — `socialProviders: { github: await
secrets.getSecret('GITHUB_OAUTH') }` — with no inline `getSecrets<{ ... }>()`
    generic. (Provider secrets are wired as before, from the `socialProviders`
    keys, so they appear in the credentials map.)
  - **cucumber**: `Actor` gains an additive cookie jar — `cookieFetch` (a
    `customFetchImpl` that replays stored cookies, stamps `Origin`, and captures
    `Set-Cookie`), plus `cookieHeader`, `storeSetCookie`, and `clearCookies`. This
    lets a cucumber actor drive a real cookie-backed session (e.g. the Better Auth
    client SDK) instead of hand-rolling a jar per suite. The existing JWT/bearer
    actor behaviour is unchanged.

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/core@0.12.32

## 0.12.3

### Patch Changes

- a8f115e: Export Actor and ActorDispatchContext for HTTP-based e2e test actors

## 0.12.2

### Patch Changes

- 25848ee: Bumping up

## 0.12.1

### Patch Changes

- 9060165: New `pikku tests init` scaffolds a Cucumber BDD test harness in your functions package. The companion `@pikku/cucumber` package provides the world, hooks, step library, and database utilities — wiring real Pikku RPC dispatch against an in-process SQLite copy seeded from migrations. `pikku tests coverage` generates per-function coverage summaries, surfaced in the console.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
