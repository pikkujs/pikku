# Changelog (verbose)

The full account of the work on this branch — what changed and _why_. The terse
one-line-per-change version is in [`CHANGELOG.md`](./CHANGELOG.md).

Three sweeps landed here, all based on the same `main`: a workflow-reliability
pass, a security pass, and a core best-practices / 1.0-readiness pass.

---

## Unreleased — 2026-08-06 … 2026-08-07

## Workflow reliability

### `fix(schedule)`: invoke the RPC a delayed schedule names, with its data

A delayed schedule resolved its target but dropped the payload, so the deferred
call arrived with no arguments. It now invokes the named RPC with the data the
schedule carried.

### `fix(core)`: strip undefined-valued properties before schema validation

A property present but `undefined` was reaching the validator as a key, so
schemas that forbid extra/absent fields rejected input that was in fact valid.
Undefined-valued properties are removed before validation.

### `feat(inspector)`: report a schema a contract names but codegen never generated

A contract could reference a schema name that code generation never emitted,
producing a runtime lookup miss with no earlier signal. The inspector now flags
the dangling reference at inspect time.

### `fix(repo)`: build addons before generating the apps that reference them

App generation consumed addon outputs that had not necessarily been built yet,
so a clean build could fail on ordering alone. Addons build first.

### `test(e2e)`: add chaos workflows and a durable side-effect ledger

Adds end-to-end workflows that inject failure, plus a durable ledger that
records side effects so a retried or resumed run can be checked for exactly-once
behaviour rather than assumed correct.

### `docs`: changeset and findings report for the workflow reliability sweep

The changeset entry and the written-up findings for the above.

---

## Security

Every fix here shipped with verifier coverage that fails before the change and
passes after.

### `fix(core,kysely,mongodb)`: claim an agent approval in the store, not in memory

Agent approval was tracked in process memory, so two processes could each see a
run as un-approved and both execute it — a TOCTOU race across the fleet. The
claim now happens in the store as an atomic compare-and-set, so exactly one
process wins. This is the multi-process correctness fix underpinning the two
single-use fixes below.

### `fix(core)`: make agent approval single-use — claim the run before executing

An approval could be replayed to execute the same run more than once. The run is
claimed before execution, so a second attempt finds it already taken.

### `fix(core)`: make the streaming agent resume single-use too

The streaming resume path had the same replay exposure as approval; it is now
single-use on the same claim mechanism.

### `fix(core,node)`: require a signature on content uploads, matching reads

Reads were signature-verified but uploads were not, so the write side was the
weaker door. Uploads now require the same signature as reads.

### `fix(express)`: verify signatures on reaper uploads and static asset reads

The Express adapter's reaper-upload and static-asset paths bypassed the
signature check that the core content service enforces; they now verify too.

### `fix(better-auth)`: stop trusting forwarded headers for the dev quick-login gate

The dev quick-login gate keyed off a forwarded header a client could set, so the
"only in dev" guard could be spoofed. It no longer trusts forwarded headers.

### `fix(templates,better-auth)`: drop the public remote secret; make dev login inert in prod

A template shipped a remote secret in client-reachable code, and the dev-login
convenience was live in production builds. The secret is gone and dev login is
inert outside dev.

### `fix(cli)`: default the generated CLI channel to session-required

A generated CLI channel defaulted to open, so a new channel was unauthenticated
unless the author remembered to lock it. It now defaults to session-required —
opening it is the explicit, visible choice.

### `fix(core)`: restrict a graph workflow's startNode to declared entry nodes

`startNode` accepted any node id, so a caller could enter a graph partway and
skip guard steps. It is restricted to nodes the graph declares as entry points.

### `fix(core)`: bound short-flag cluster parsing to prevent a CLI-over-channel DoS

Clustered short flags (`-abc…`) were parsed unboundedly, so a crafted argument
over a CLI-bearing channel could pin CPU. Parsing is now bounded.

### `fix(core)`: match the remote-RPC prefix case-insensitively in the mesh auth gate

The mesh auth gate compared the remote-RPC prefix case-sensitively, so a
differently-cased prefix could slip past the gate. The comparison is now
case-insensitive, matching how the prefix is used downstream.

### `fix(core)`: clear the session cookie on logout instead of re-minting it

Logout re-issued a session cookie instead of clearing it, so the session was not
actually ended client-side. Logout now clears it.

### `test(core)`: cover allowedHosts reaching secret definitions meta

Adds coverage proving `allowedHosts` cannot reach secret-definition metadata —
the guard for the boundary the above fixes tightened.

### `docs(core)`: record why the middleware resolution cache is unbounded

Middleware is dynamic and its resolution cache is deliberately unbounded; this
records the reasoning so the unbounded cache is not "fixed" into a correctness
bug later.

---

## Core best-practices & 1.0 readiness

### `refactor(core)`: split pikku-workflow-service into composable modules

`pikku-workflow-service.ts` had grown past 2325 lines. It is split into
composable modules (errors, constants, run-engine types, meta resolver, queue
routing/wiring, recovery, approval) and brought back under the 2000-line
ceiling, with a guard test that keeps it there.

### `feat(core)!`: remove addTagPermission, addHTTPPermission and ZodLike

**Breaking.** Three legacy exports with no remaining internal callers are
removed outright rather than carried as deprecated surface into 1.0.

### `test(core)`: pin the published export surface against drift

`public-surface.json` records the exported names per entry point; a guard test
fails when the surface drifts, so an added or removed export is a deliberate,
reviewed change.

### `refactor(core)`: assert to named types, never to `any`

Hotspot `as any` casts are replaced with assertions to named types, verified
individually, so the escape hatch is not hiding a real type error.

### `docs(core)`: move load-bearing reasoning into the knowledge bundle

Comments that carried real reasoning (not restatement of the code) move into the
`knowledge/` OKF bundle as durable notes; comments that merely restated the code
are deleted.

### `fix(benchmarks)`: repair the two unrunnable hot-path profilers

Two hot-path profilers had bit-rotted and could not run; they are repaired so
the hot-path numbers can be reproduced.

### `refactor(core)`: keep the workflow service under the ceiling after the rebase

A rebase had pushed the workflow service back over the size ceiling; this trims
it under again.

### `refactor(core)`: break the rpc→ai-agent edge, and split the conformance suite

The `rpc` wire statically imported the `ai-agent` wire, coupling every non-agent
consumer to the agent runtime. The `wire.rpc.agent` facade moves behind a
dynamic import, breaking the static edge, and the conformance suite is split to
match. Measured ~2.4× faster `getContextRPCService`, and 5,507 lines of agent
runtime dropped from every non-agent barrel.

### `refactor(core)`: give each wire an explicit, pinned set of crossovers

Each wire's permitted cross-wire dependencies are made explicit and pinned by a
guard test (14 edges), so a new coupling between wires cannot be added silently.

### `refactor(core)`: delete exports nothing references

Dead exported symbols with no references anywhere are removed.

### `refactor(core)!`: move the adapter surface off the package root → `@pikku/core/ecosystem`

**Breaking.** The package root also carried what runtime adapters and the CLI
reach for — `runPikkuFunc`, `pikkuState`, the singleton-service accessors,
`httpRouter` — whose signatures move with the CLI's codegen. Pinning them to a
1.0 root promise meant either breaking that promise or freezing the generator.
They move to `@pikku/core/ecosystem`; the root keeps only the application-facing
surface. `./internal` remains as an alias because the pinned bootstrap CLI still
emits it.

_Reached in three steps on this branch — first `@pikku/core/internal`, then
`/runtime`, then `/ecosystem`. `internal` read as a warning against code the
generator itself emits; `runtime` read as "the real API" and collided with
`packages/runtimes/*`. `ecosystem` is the net result._

### `perf(core)`: declare which modules have import-time side effects

The package had no `sideEffects` field, so bundlers could not tree-shake any of
it. Exactly five modules run code on import — all `addError(...)` registering an
error class — so the field names those five and lets everything else be dropped.
A guard test fails both on a missing entry and a stale one. `false` would have
been untrue: dropping `errors/errors.js` would make every error a generic 500.

### `feat(core)`: pin the public API at member level, not just export names

`public-surface.json` sees names only — it cannot see a method added to an
interface, or a field becoming required, which are exactly the changes that
break a consumer's build. `api-report.md` is generated from the type checker
with full signatures, committed, and guarded by a test that fails when code and
report disagree. Re-exports resolve through `getAliasedSymbol` first, or 624
symbols would report as `any`.

### `feat(core)`: make the report state what the API is, not just list it

The report now opens with the counts — exported names, members, split by stable
vs ecosystem tier — and a per-entry-point table of exclusive surface, computed
live so the figures cannot rot in prose.

### `fix(channel)`: stop the RPC timeout tests cancelling the rest of their file

`ChannelRPCRegistry` unrefs its timeout timer so an in-flight call never holds a
process open — correct, and kept. But an unref'd timer cannot be awaited under
`node:test`: the loop drains before it fires and the runner cancels the whole
file, reporting 32 tests as cancelled when only two were at fault. Fixed in the
tests with a test-scoped mock clock, not by dropping the unref.

### `fix(crypto)`: calibrate the KEK derivation test instead of budgeting milliseconds

`N secrets cost one KEK derivation, not N` asserted `elapsed < 50ms` for ~11ms
of work — 4.6× headroom against a regression that would cost seconds. Under a
2000-test suite competing for cores it went red ~1 run in 5. It now asserts
`elapsed < oneDerivation`, timed in the same run, so both sides scale with load.
