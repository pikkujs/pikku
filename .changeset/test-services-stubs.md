---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/cucumber': patch
---

Add `stub`/`spy`/`isTestRun` core utils with call recording for scenario assertions.

- `@pikku/core`: `StubTracker` moves here from `@pikku/cucumber` (which re-exports it), gaining `record`/`getCalls`/`reset`. New plain-import utils backed by a process-wide tracker: `stub(name, impl?)` (recording fake), `spy(name, real)` (record + pass through), `isTestRun()` (reads `PIKKU_TEST_RUN`). Nothing is injected into service factories and no new factory types exist — swap services with a plain `isTestRun()` conditional where needed. New scenario DSL steps: `workflow.expectService('email.send', { calledWith })` asserts recorded stub calls via the console RPC, `workflow.expectError(...)` walks error branches.
- `@pikku/cli`: `pikku dev --test` sets `PIKKU_TEST_RUN` and wraps the dev-provided default services (email) in recording spies; independent of `--coverage`, absent from production `pikku serve`. `pikku scenario run` resets recorded calls per flow.
- `@pikku/addon-console`: exposed `getStubCalls` / `resetStubs` RPCs next to the coverage snapshot endpoints.
