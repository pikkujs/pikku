# Changelog

Terse by design — one line per change. Full reasoning for every entry is in
[`CHANGELOG.verbose.md`](./CHANGELOG.verbose.md).

## Unreleased — 2026-08-06 … 2026-08-07

### Breaking

- `feat(core)!`: remove `addTagPermission`, `addHTTPPermission`, `ZodLike`
- `refactor(core)!`: move the adapter surface out of the package root to `@pikku/core/ecosystem`

### Features

- `feat(core)`: pin the public API at member level, generated into `api-report.md`
- `feat(core)`: report states what the API is (counts, tiers) rather than only listing it
- `feat(inspector)`: report a schema a contract names but codegen never generated

### Security

- `fix(core,kysely,mongodb)`: claim an agent approval in the store, not in memory
- `fix(core)`: make agent approval single-use — claim the run before executing
- `fix(core)`: make the streaming agent resume single-use too
- `fix(core,node)`: require a signature on content uploads, matching reads
- `fix(express)`: verify signatures on reaper uploads and static asset reads
- `fix(better-auth)`: stop trusting forwarded headers for the dev quick-login gate
- `fix(templates,better-auth)`: drop the public remote secret; make dev login inert in prod
- `fix(cli)`: default the generated CLI channel to session-required
- `fix(core)`: restrict a graph workflow's `startNode` to declared entry nodes
- `fix(core)`: bound short-flag cluster parsing to prevent a CLI-over-channel DoS
- `fix(core)`: match the remote-RPC prefix case-insensitively in the mesh auth gate
- `fix(core)`: clear the session cookie on logout instead of re-minting it

### Fixes

- `fix(core)`: derive a graph step's rpc from node meta, not the queue message
- `fix(schedule)`: invoke the RPC a delayed schedule names, with its data
- `fix(core)`: strip undefined-valued properties before schema validation
- `fix(channel)`: stop the RPC timeout tests cancelling the rest of their file
- `fix(crypto)`: calibrate the KEK derivation test instead of budgeting milliseconds
- `fix(benchmarks)`: repair the two unrunnable hot-path profilers
- `fix(repo)`: build addons before generating the apps that reference them

### Refactors

- `refactor(core)`: split `pikku-workflow-service` into composable modules (2325 → <2000 lines)
- `refactor(core)`: give each wire an explicit, pinned set of crossovers
- `refactor(core)`: break the `rpc → ai-agent` edge, and split the conformance suite
- `refactor(core)`: delete exports nothing references
- `refactor(core)`: assert to named types, never to `any`

### Performance

- `perf(core)`: declare which modules have import-time side effects, for tree-shaking

### Tests

- `test(core)`: pin the published export surface against drift
- `test(core)`: cover `allowedHosts` reaching secret definitions meta
- `test(e2e)`: add chaos workflows and a durable side-effect ledger

### Docs

- `docs(core)`: move load-bearing reasoning into the knowledge bundle
- `docs(core)`: record why the middleware resolution cache is unbounded
- `docs`: changeset and findings report for the workflow reliability sweep
