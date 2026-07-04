---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/cucumber': patch
---

Add `pikkuTestServices` / `pikkuTestWireServices`: declared, inspector-discovered test stub factories with call recording.

- `@pikku/core`: `StubTracker` moves here from `@pikku/cucumber` (which re-exports it), gaining `record`/`getCalls`/`reset`; new `createStubHelpers` provides `stub` (replace + record) and `spy` (record + pass through). New optional `stubTracker` singleton service and `CreateTestServices`/`CreateTestWireServices` types. The function runner applies the project's test wire factory per invocation when the server booted in test mode — the per-actor fault-injection hook. New scenario DSL steps: `workflow.expectService('email.send', { calledWith })` asserts recorded stub calls via the console RPC, `workflow.expectError(...)` walks error branches.
- `@pikku/inspector`: discovers `pikkuTestServices`/`pikkuTestWireServices` factories like the other service factories.
- `@pikku/cli`: generated typed wrappers in `pikku-types`; `--test` flag on `pikku dev`/`pikku serve` (implied by `--coverage`) activates the declared stubs — merged over real singletons, never wired into production builds; `pikku scenario run --coverage` resets stubs per flow.
- `@pikku/addon-console`: exposed `getStubCalls` / `resetStubs` RPCs next to the coverage snapshot endpoints.
