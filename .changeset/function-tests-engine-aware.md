---
'@pikku/addon-console': patch
'@pikku/cli': patch
'@pikku/cucumber': patch
---

Make the function-test harness work for monorepo + engine-aware projects:

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
