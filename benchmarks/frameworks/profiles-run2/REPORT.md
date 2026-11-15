# Pikku HTTP runner vs Elysia / raw Bun: profile + matrix (run2)

Machine: Apple M4, 10 cores, Bun 1.4.3, commit 607e97713. Never idle: load1 was 25-32 at first (other users), then 2.2-6.2 during the matrix (some is the harness: autocannon + server). All numbers are loaded-machine numbers.

## Measured vs inferred
- MEASURED: matrix (5 runs/cell), `bun --cpu-prof` self/inclusive samples on UNBUNDLED, unminified sources (3 runs each: pikku-L0, pikku-LE, elysia), keepNames A/B.
- us/req per frame = (frame share of active samples) x (that run's `ps cputime` us/req). Estimate, not a direct timer.
- INFERRED: "essential vs skippable" classification, savings estimates, and who calls combineChannelMiddleware.
- Profiles are of `bun src` runs (unbundled, ~143 us/req L0, 125 Elysia, 156 LE), not the compiled binaries (matrix ~135/105/138).

## Matrix (CPU us/req saturated, median of 5 [min-max], load1 range in cell)
| variant | N=1 | N=30 |
|---|---|---|
| raw-bun | 107 [102-110] load 2.5-4.6 | 104 [102-108] load 3.1-4.2 |
| elysia | 105 [103-110] load 2.8-4.6 | 112 [108-115] load 3.7-4.4 |
| elysia+otel | 163 [158-190] load 2.8-4.0 | 161 [160-166] load 2.2-5.3 |
| pikku L0 | 135 [131-207] load 2.2-5.0 | 140 [139-154] load 3.2-5.0 |
| pikku LE | 138 [133-144] load 2.4-4.4 | 143 [141-152] load 2.3-5.1 |
| pikku L3 | 163 [163-169] load 2.2-6.2 | 167 [165-173] load 2.7-4.7 |
Start load: 4.1/9.8/8.9. The 207 at pikku-L0 N=1 is a single outlier run (rps 4706); median is robust to it. Pikku L0 - Elysia = ~30 us (N=1), ~28 (N=30). LE - L0 = 3 us. L3 about equals Elysia+otel (163 vs 163 at N=1).

## Where the gap is (unbundled profile, 3 runs, us/req)
Active total: pikku-L0 145 [141-151], elysia 122 [118-125] (gap ~23).
Split by owner: shared third-party work (better-auth, kysely, cfworker, db) pikku 117 vs elysia 111; framework-owned pikku 27.8 [24-33] vs elysia 11.0 [10.6-11.3]. So ~17 us of the gap is Pikku-owned frames, ~6 us is shared-library code running slower/more under Pikku (better-auth runWithEndpointContext 5.7 vs 3.5; native importKey 3.3 [1.4-7.1] vs 1.1) , not attributable to the runner. Sanity: sqlite `prepare` 27.3 vs 28.0 and `all` 23.2 vs 23.4 agree.

## Ranked Pikku-only per-request work (L0, framework-owned self time, [min-max of 3])
| # | us/req | what | where | class |
|---|---|---|---|---|
| 1 | ~6.9 [5.7-8.1] vs Elysia 4.8 (native, no JS frame; ~2 us delta) | Request/Response/Headers wrapping, `entries`, `copyDataProperties`, ReadableStream reader | pikku-fetch-http-request.ts / -response.ts, bun-server/src/pikku-bun-server.ts:295-360 | partly essential; delta could shrink |
| 2 | 2.30 [0.25-6.38] | `combineChannelMiddleware` (huge spread = cache miss / init landing in window; caller not verified) | core/src/channel-middleware-runner.ts:52-97 | skippable on HTTP; make lazy/skip when wire is not a channel (inferred) |
| 3 | ~3.05 incl (2.16 self randomHex + 0.89 closure) | trace/span id generation, `resolveHTTPTrace` 2.53 incl | core/src/trace.ts:29-36, 43, 86; http-runner.ts:489-493 | skippable when telemetry off / not propagating: generate ids lazily |
| 4 | 2.06 [1.7-3.0] self, 2.26 incl `data` | bounded body read (getReader/releaseLock native 0.85 extra) | pikku-fetch-http-request.ts:37,60,107,138,142 | essential (body must be read); fast path when content-length small could save ~1 us |
| 5 | 1.24 + 1.03 self | `executeFunction` / `runPikkuFunc` bodies | function-runner.ts:206-794 (285, 129 in dist) | essential, spread over many small steps |
| 6 | 0.82 | `toResponse` | pikku-fetch-http-response.ts:109 | essential |
| 7 | 0.77 [0.71-0.83] | `withoutSecrets` Proxy per request | core/src/services/secretless.ts:19-35 | cacheable per service set (could-be-lazy) |
| 8 | 0.53 | `pikkuState` lookups per request | pikku-state.ts:62 | hoist / cache (small) |
| 9 | 0.2-0.3 each | mergeRequestData, buildCredentialResolutions, stripUndefinedValues, cacheGet, createMiddlewareSessionWireProps, getMatchingRoute | merge-request-data.ts:14, credential-overrides.ts:19, schema.ts, middleware-runner.ts:105, user-session-service.ts:73, http-runner.ts:90 | essential/tiny |
| 10 | 0.15 | `Matched route` info log template string built even if level filters | http-runner.ts:247-249 | skippable (build only if enabled) |
Large inclusive buckets that are NOT runner overhead: sqlite prepare 27.5 (shared), better-auth session 3.8 incl auth-session.ts:24.
Not found: any single large lazy-init win in the runner. Pikku's gap is many 0.3-3 us items.

## keepNames A/B (inconclusive)
Profile suggested `__name` (defineProperty per closure, bundler `keepNames: true`, cli/src/deploy/bundler/bun-bundler.ts:186, node-bundler.ts:78) at ~8%. Real A/B: patched bundle (`__name` returns target), `bun build --compile`, 3 interleaved L0 runs at load 3.6-4.5:
control 134.6 / 137.9 / 159.6; no-keepNames 129.1 / 136.1 / 139.5 us/req. Median diff ~2 us (1-2%), within noise. Conformance of patched binary not run (only requests with 0 non-2xx observed). Do not claim 8%. Files: nokeep/ab.log.

## Proposed fixes (NOT implemented)
(a) Skip OtlpLogger work when the sink registry has no active sinks. Matrix LE-L0 = 3 us/req (N=1 and N=30); earlier profile put forward/toRecord/scrubText at 2-3% each at LE. Gate at the top of `OtlpLogger.forward` (core/src/otlp/otlp-logger.ts:212-255) on the registry `active` getter (otlp-sink.ts:38, 115, 150), like otlp-tracer.ts:60-75, so `toRecord` (149-194) and `scrubText` (129-133) never run. Saving ~2-3 us at LE, 0 at L0. Risk: low; a sink added later misses earlier logs (same as tracer), and need a test that logs flow once a sink registers.
(b) Lazy init:
1. Trace id: generate `randomHex`/`createTrace` only when a tracer/sink is active or a traceparent is present (trace.ts:29-43, 86; http-runner.ts:489-493). ~2.5-3 us at L0. Risk: medium; id may be echoed in response headers/logs, and function-span code expects a trace.
2. Skip `combineChannelMiddleware` for non-channel wires (channel-middleware-runner.ts:52). ~0.3-2.3 us (mean 2.3, noisy). Risk: low once caller is identified (not verified).
3. Cache `withoutSecrets` result per services object (secretless.ts:19-35). ~0.7 us. Risk: low-medium (secret scoping must remain per wire).
4. Build "Matched route" message only when info enabled (http-runner.ts:247-249). ~0.2 us. Risk: none.
5. Body read fast path (pikku-fetch-http-request.ts:60). ~1 us. Risk: medium (size limit enforcement).
Total realistic: ~5-7 us of the ~17 us framework-owned gap (inferred); the remainder is distributed. Elysia's compile-time codegen (no per-request closure/Proxy construction) is why it is lower; matching it needs structural change, not a lazy flag.

## Could not verify / caveats
Machine never idle; ±5-10% spread. LE per-frame savings taken from earlier profile + matrix delta, not re-derived here. raw-bun/elysia profiles from `bun src`, not compiled. Run1-3 compiled-bundle profiles (run1..run3/, minified) are secondary; raw-bun.cpuprofile there is stale, ignore. Tooling: prof-driver.ts, analyze.ts, residual.ts.
