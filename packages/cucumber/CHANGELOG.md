# @pikku/cucumber

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
