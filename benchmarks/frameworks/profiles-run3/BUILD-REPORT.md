# Build report: owner-approved perf fixes (branch feat/otlp-sink-registry, uncommitted)

Everything is in `@pikku/core` (patch changeset `.changeset/hot-path-body-trace-logger.md`). Knowledge notes in `packages/core/knowledge/decisions/internals/`.

## Per fix

### 1. Body fast path (`wirings/http/pikku-fetch-http-request.ts`, `#readBoundedBuffer`, ~l.93-110)

- Native `request.arrayBuffer()` only when `content-length` matches `/^\d+$/`, is <= `maxBodySize` (the existing 413 check runs first, unchanged) and there is no `transfer-encoding`. `byteLength` re-checked after the read. Everything else: the existing bounded reader.
- Tests: `pikku-fetch-http-request-body-path.test.ts` (21): read path counted with a spied request (native vs stream), missing / non-numeric (`abc`, `+7`, `0x7`, `-7`, `7, 7`, `1e1`, empty) / over-limit / exact-limit / chunked / content-length+transfer-encoding / body longer than declared (413 after read) / identical bytes both paths / `data()` JSON / zero length. Failing before (6 native-path tests), passing after. Note `Headers` trims whitespace, so ` 7` is `7`.
- Verifier: `verifiers/bun-server` gained a POST `/api/echo-body` route and 5 real-TCP tests (content-length body, chunked, 413 over 10 MiB, content-length shorter than body with a pipelined `GET /smuggled`, `0x7` never served). These pass before and after (parity guard, not a fail-first test). `bun run test` there: 8/8.
- Safety reasoning is in knowledge `the-body-fast-path-relies-on-the-bun-parser-framing.md`. Not tested: Node, Workers, HTTP/2, express/fastify shims.

### 2. `OtlpLogger.forward` gate (`otlp/otlp-logger.ts` ~l.212)

- `if (level < this.minLevel || this.exporter.active === false) return`, same test as `otlp-tracer.ts`.
- Tests (`otlp-logger.test.ts`): a message object with a getter is never read while the registry is empty (so `toRecord`/`scrubText` do not run) and the inner logger still writes; once a sink registers, logs flow. Failing before.

### 3. Lazy trace ids (`trace.ts` `createLazyTrace`, used by `resolveHTTPTrace`; `http-runner.ts` wire `traceId` accessor)

- Consumers enumerated (grep of every `traceId`/`.trace` user in core, runtimes, services): HTTP error `errorId` + `Error id:` log (`handle-error.ts`), `scopedLogger`, function-runner (`rootTrace`, `decideFunctionTrace`, span, audit, analytics), `traceQueueService`/scheduler/webhook `traceparent`, boundary spans, `adoptTraceparent` (mesh auth), workflow/RPC/channel/queue wires. None needs the id before it reads it, so no stop condition. Instead of "generate only if tracer/sink active", the ids are own enumerable accessors drawn on first read and then stable (setters let `adoptTraceparent` replace them). A traceId from the runtime and a trusted inbound `traceparent` stay concrete. Only the HTTP runner is lazy; `createTrace`/`continueTrace`/`traceWire` are unchanged.
- Tests: `trace.test.ts` (no draw until read, 2 draws on read, spread copies, adopt in place, `createTrace` still eager); `http-lazy-trace.test.ts` (10, through `fetch`): no 16-byte draw on a plain request, stable id on wire/trace/spread, 500 `errorId` equals the logged `Error id` and the scoped logger id, 404 `errorId`, queued job `traceparent` equals the wire's, tracer span id equals the wire's, trusted inbound traceparent concrete, runtime `traceId`, untrusted header ignored, ids differ per request. Existing `verifiers/tracing` (18 tests: errorId, hops, queue, workflow) passes.
- Risk: the trace is no longer a plain data object (accessors); anything bypassing the accessor, none found.

### 4. Secretless view cache (`services/secretless.ts` `secretlessView`, used at `function-runner.ts` permission site)

- `WeakMap<services, Map<context, view>>`; only the permission call (singleton services). The second `withoutSecrets` (function services) takes a per-invocation object (wire services, audit, trace wrappers, analytics getter), so a cache would never hit and would cost a WeakMap write; left uncached.
- Tests (`secretless.test.ts`, 6): same view for same object+context, still throws on `secrets`, not shared across objects, not shared across contexts (message names its own), original untouched, no-secrets object returned as is.
- Risk: the view is a snapshot; services added to the singleton object after the first request are not seen by permissions (documented in knowledge).

### 5. Credential wire lazy (`services/credential-wire-service.ts` `createLazyCredentialWireProps`, `function-runner.ts` ~l.385)

- Built on first `setCredential`/`getCredential`/`getCredentials`, once. Only the no-override branch is lazy: `buildCredentialResolutions(declared, undefined)` cannot throw, so error timing is unchanged; the addon-override branch stays eager. Tests: `credential-wire-service.test.ts` (3): nothing built until used, built once, set-before-get shared, parity with eager props.
- Skipped, with reason: (a) session accessors cache: `createSessionAccessors` measured 18 ns, a WeakMap lookup costs the same, no gain. (b) "Matched route" log string: `Logger` has no level query, so skipping the template needs a new optional `Logger` API method (public surface) for ~28 ns; not done. Both measured as noise in UNDERSTANDING.md.

## Measurements (in-process harness, `inproc.ts`, ctl only, 150 rounds x 300 req)

Before/after are separate processes, alternated (before-first, after-first, ...), with the 7 changed core modules swapped into `packages/core/dist` from the HEAD and working-tree sources, both transpiled by `Bun.Transpiler`. The harness's own interleaving only switches flags, which these fixes do not have. Machine load average 9 to 18 on 10 cores (`uptime` per run in the scratchpad `.log` files), i.e. very noisy. Conformance in-harness (200 / 401 / 403 / 422 / revoked 401 / restored 200) passed in all 14 runs.

L0 (PIKKU_TELEMETRY=0), 4 paired runs, wall us/req median [p25]:

| run                                                                                                                                                                                                                                                                                                                                  | before        | after         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------- |
| 1                                                                                                                                                                                                                                                                                                                                    | 137.9 [123.9] | 123.9 [116.4] |
| 2                                                                                                                                                                                                                                                                                                                                    | 131.1 [121.5] | 123.4 [114.2] |
| 3                                                                                                                                                                                                                                                                                                                                    | 131.7 [124.4] | 136.2 [118.2] |
| 4                                                                                                                                                                                                                                                                                                                                    | 133.8 [125.5] | 123.8 [114.8] |
| After is 7 to 14 us faster in 3 of 4 runs on the median and 6 to 11 us on p25 in all 4; run 3 median is inverted by load. Predicted from UNDERSTANDING.md: body ~5 + trace ~2 + small ~1 = ~8 us. Measured is consistent (~8-10 us), with the caveat that the harness request has a string body, so the TCP body saving is unproven. |

LE (telemetry on, empty registry), 6 paired runs: after faster in 5 of 6 (e.g. 149.5 -> 106.5, 158.9 -> 136.5, 210.9 -> 176.5), inverted in 1 (159.4 -> 215.3) with load 9 to 18; two of the "before" runs were 400+ us (machine saturated). Direction agrees with the predicted extra 2-3 us from fix 2, magnitude is not resolvable.

Not done: the TCP matrix (pikku L0/LE/L3 N=1). It needs two full bundle builds and the box sat at load 10 to 17; numbers would not be usable. The conformance gate was run (`bun run.ts --conformance-only --only pikku`): PASS for pikku-LE, L0, L3 at N=1 and 30, on the changed core.

## Verification

- `packages/core`: `./run-tests.sh` 6836 pass, 1 fail (`source files stay composable`: `otlp/runs/run-stitcher.test.ts` is 2215 lines, not touched here). `bun test src/services/local-content-e2e.test.ts` has an after-hook timeout (`server.close` hangs on keep-alive), unrelated to these files; it did not appear in the full run.
- `runtimes/bun-server` `./run-tests.sh` 37 pass. `verifiers/bun-server` 8/8, `verifiers/tracing` 18/18.
- `bun run tsc` in `packages/core`: clean. Prettier applied to changed files; oxlint shows only warnings already present.

## Files

Changed: `packages/core/src/{trace.ts, trace.test.ts, function/function-runner.ts, otlp/otlp-logger.ts, otlp/otlp-logger.test.ts, services/secretless.ts, services/secretless.test.ts, services/credential-wire-service.ts, services/credential-wire-service.test.ts, wirings/http/http-runner.ts, wirings/http/pikku-fetch-http-request.ts}`, `packages/core/knowledge/decisions/internals/index.md`, `verifiers/bun-server/src/start.ts`.
New: `packages/core/src/wirings/http/{http-lazy-trace.test.ts, pikku-fetch-http-request-body-path.test.ts}`, three knowledge notes, `verifiers/bun-server/src/functions/echo-body.{function,wiring}.ts`, `.changeset/hot-path-body-trace-logger.md`, this report.

## Review fixes

Owner-approved changes after review, all uncommitted.

1. **Body fast path is opt-in.** `PikkuFetchHTTPRequestOptions.trustedFraming` (default false). The native `arrayBuffer()` read runs only when it is true, plus the existing digits / limit / no `transfer-encoding` guards and the post-read byteLength check. Only `PikkuBunServer` sets it (`packages/runtimes/bun-server/src/pikku-bun-server.ts`, the `new PikkuFetchHTTPRequest(req, ...)` in the fetch handler). All other adapters keep the bounded reader. Tests: default off uses the bounded reader, on uses the native read, guards and the post-read 413 still apply; a bun-server test runs a real `Bun.serve`, spies `Request.prototype.arrayBuffer` and fails if the flag is removed (checked). Knowledge note updated. Note: the bun server passes `options.maxBodySize` only to `fetchData`, which ignores it for an already-wrapped request, so the Bun server body limit is still the 10 MiB default (pre-existing, unchanged).
2. **Secretless pass-through is not cached.** `secretlessView` caches only a real stripped copy; a services object without `secrets` is returned as is each time. Test attaches `secrets` after the first call and the view then throws. Knowledge note updated.
3. **HTTP wire `traceId` setter validates.** It adopts a value only if `isValidTraceId` accepts it (32 lowercase hex, not all zero); anything else (including `undefined`) is ignored and the current id kept. Before the change `wire.traceId` was a plain property that took any assigned value; ignoring invalid input is the conservative reading, and the one writer (mesh auth, `trace.ts`) assigns a parsed valid id. Test added.
4. **Tests.** `function-runner.test.ts` proves `runPikkuFunc` hands permissions one cached secretless view across invocations (fails with per-call `withoutSecrets`) and builds the credential wire service only on first use (fails with the eager construction). The 'logs flow once a sink registers' test now also asserts record work is skipped while empty and resumes after registration.

Changeset now lists `@pikku/bun-server` as well.

Results: core `./run-tests.sh` fails only `source files stay composable` (run-stitcher 2000-line; file untouched, not in `git status`) plus `edge-clean` which needs `@pikku/deploy` built; bun-server 38 pass; `bun run build` (tsc) clean; verifiers/bun-server 8/8; verifiers/tracing 18/18; conformance gate PASS for pikku-LE, L0, L3 at N=1,30.
