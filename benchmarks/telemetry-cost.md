# Telemetry cost benchmark

What OpenTelemetry-style telemetry costs a Pikku HTTP request in `@pikku/core`, at four levels, plus stress and failure runs. Harness: `benchmarks/bench-telemetry*.ts` (`yarn benchmark:telemetry`, `yarn benchmark:telemetry:stress`). Raw data: `telemetry-results.json` (matrix) and `telemetry-stress-results.json` (stress).

## What core actually does

- "Off" is the inert runtime telemetry: a no-op tracer, no exporter, no timers. `createRuntimeTelemetry` returns it unless `PIKKU_OTLP_ENDPOINT` is set (and `PIKKU_TELEMETRY` does not disable it). Off is the default.
- There is no sampling. A tracer either exists or does not; inbound `traceparent` flags are not reachable through the HTTP runner. So there is no L4 sampling level, and none was invented.
- There is no gzip in the exporter, so there is no gzip variant.
- Exporter (`packages/core/src/otlp/otlp-http-exporter.ts`): per-signal queues (spans 2048, logs 4096, metrics 512). Overflow drops the oldest entries and counts them in `pikku.telemetry.dropped`. A batch goes out when the queue reaches `maxBatch` (256) or on the flush timer. One POST is retried once after 1 s, then dropped; repeated failures back off. Request timeout defaults to 10 s. `close()` flushes but is capped at 2 s. Batches are sent through a per-signal promise chain, one POST at a time.
- The dev server's 3 s export cap does not exist in this repo; it was exercised by building the exporter with `requestTimeoutMs: 3000`.

## Method

Devbox only (Neoverse-N1, 16 cores, shared and busy; load average 2-10 during the runs), Node 24.22.3 (system Node is 22). App and sink are separate processes pinned with taskset to cores 12 and 13; the load generator ran on core 14. Matrix: 2 trees x 4 levels x 4 scenarios x 5 runs, interleaved in shuffled rounds, fresh process per run, 6 s warm-up and 6 s measured window, median and stddev reported, nothing discarded. CPU is `process.cpuUsage()` (all threads) divided by requests. GC and event-loop lag come from `perf_hooks`.

Trees: `main` (8ef2fa83a) and PR #2412 `otlp-logger-context-attrs` (8ac0fee1d). Both are shown because the branch adds per-span work (attribute WeakMap, identity re-stamp, logger context merge); the harness uses only APIs that exist on both. Main is the base for this PR.

Levels: L0 off. L1 spans into a discarding exporter. L2 L1 plus one OtlpLogger record per request, discarded. L3 the real `createRuntimeTelemetry`: protobuf encoding, HTTP POST to a loopback sink in another process, process metrics on. Scenarios: bare, schema, middleware, full.

## Cost per request (CPU, median of 5, extra us/request over L0 and % of L0)

| scenario   | L0 us/req | L1 main   | L1 branch | L2 main   | L2 branch | L3 main     | L3 branch   |
| ---------- | --------- | --------- | --------- | --------- | --------- | ----------- | ----------- |
| bare       | 143 / 147 | +28 (20%) | +47 (32%) | +58 (40%) | +70 (48%) | +223 (156%) | +265 (181%) |
| schema     | 199 / 205 | +42 (21%) | +54 (26%) | +70 (35%) | +66 (32%) | +265 (133%) | +295 (144%) |
| middleware | 149 / 150 | +36 (24%) | +43 (28%) | +61 (41%) | +80 (53%) | +243 (164%) | +276 (183%) |
| full       | 213 / 217 | +35 (16%) | +36 (17%) | +68 (32%) | +83 (38%) | +266 (125%) | +315 (145%) |

L0 is main / branch. Per-cell stddev is about 2-10 us at L0-L2 and 13-37 us at L3 (1-5% at L0, up to about 8% at L3). Differences of under about 10 us between main and branch are within noise; the branch looks roughly 5-20 us dearer at L1/L2 and 25-50 us at L3 but the L3 gap is only partly outside the spread, so treat it as likely small and real, not exact. Absolute baselines (about 150-220 us/request) are high because N1 is a slow core and the harness runs the full Pikku HTTP path.

Latency, branch, full scenario (p99): L0 314 us, L1 374, L2 474, L3 1727 (p99.9 about 7 ms at L3). Throughput falls from 4605 to 3945 (L1), 3331 (L2), 1879 (L3) req/s. L3 exports about 600 bytes per request (1 span, 2 log records), 0 dropped. L3 GC pause is about 40 ms per 1000 requests; the event-loop lag figures are dominated by a 10 ms timer-resolution artifact and should not be read as real stalls.

In-process numbers (this matrix) have no network between client and app: requests go straight into the runner. They exclude HTTP parsing and socket cost, so the percentages are an upper bound on what a client sees. The stress runs below do use real HTTP (autocannon).

## Where L3 spends the extra CPU (cpu-prof, branch, full scenario, pinned core)

Difference vs L0 per request, by file: protobuf-writer +65 us, undici fetch +46, otlp-logger +27, text encoding +24, GC +21, function-span +16, otlp-encode +13, otlp-tracer +7.5.

Top 5 functions by self time at L3: garbage collector 7.6%; `randomFillSync` 5.3% (trace and span id generation through node crypto); function-runner closure 4.3% (mostly baseline); `ProtobufWriter` constructor 3.9%; `TextEncoder.encode` 3.9%.

## Stress findings (branch tree, 16-64 connections unless stated)

- Concurrency sweep (1 to 256 connections, real HTTP): L0 saturates near 1550-1750 req/s with p50 growing linearly with concurrency (the harness server is single-threaded). L3 saturates near 1000 req/s (about 1000-1100 cpu-us/req at 16+ connections), a 35-40% throughput loss. At 256 connections L3 started dropping logs (5626 over the run, counted) and p99.9 reached 6.5 s versus 1.9 s at L0.
- Large attributes: 64 allowed-prefix attributes of 1 KiB cost about 2.2 ms CPU/request at L3 versus 1.1 ms with none (63 KB exported per request); long values are truncated to 1024 characters, so 100 KB values export the same 63 KB but cost the same CPU and a 150 MB RSS bump. Unlisted attribute keys are dropped by the allow-list and counted (`attributesDropped`), cheaper (1.27 ms). A 100 KB log message was exported at 8.7 KB (truncated). `PIKKU_OTLP_LOG_FIELDS=1` with 50 fields x 8 KB, depth 6, costs 11 ms CPU per request and 105 KB exported, throughput 90 req/s. That is opt-in but it is a very large multiplier.
- High cardinality (bare, a distinct user and trace id per request, 1.8 to 2.3 million requests): no leak. L1 RSS +19 MB, heap -2 MB; L3 RSS +32 MB, heap +1.7 MB; zero spans or logs dropped; L3 averaged 329 cpu-us/request.
- Soak, 360 s, real HTTP, 16 connections: L0 740k requests, heap after GC flat at 13.5 to 13.7 MB (slope 0.02 MB/min). L3 475k requests with a distinct id each, heap after GC 16.7 to 17.8 MB (slope 0.25 MB/min), RSS 286 to 293 MB; zero drops, zero errors. The 0.25 MB/min heap slope over 6 minutes is small but not zero; a longer soak would be needed to call it flat.
- Failure modes (L3, 16 connections, 55 s fault phase between healthy and recovery phases, errors 0 and timeouts 0 in every run). The request path never blocked or slowed: the fault phase ran at equal or higher req/s than healthy (about 1460 to 1560 vs 1130 to 1170), because failed exports skip the protobuf-to-socket work. Handler p99 stayed about 3.6 to 3.9 ms.

| fault                                 | spans dropped (counted) | heap after GC                      | RSS end of fault     |
| ------------------------------------- | ----------------------- | ---------------------------------- | -------------------- |
| connection refused                    | 33k, then 56k           | flat 18 MB                         | 288 -> 361 MB        |
| accepts, never answers (10 s default) | 34k                     | 18 -> 64 MB (77 MB after recovery) | 284 -> 387 -> 482 MB |
| accepts, never answers (3 s timeout)  | 35k                     | 18 -> 66 MB                        | 281 -> 386 -> 490 MB |
| answers after 5 s                     | 34k                     | 18 -> 66 MB                        | 284 -> 393 -> 482 MB |
| HTTP 500                              | 33k                     | flat                               | 286 -> 349 MB        |
| HTTP 429                              | 33k                     | flat                               | 287 -> 354 MB        |
| HTTP 400 (not retried)                | 33k                     | flat                               | 283 -> 295 MB        |

- Shutdown: healthy sink, `close()` took 0.5 to 2.5 ms and delivered every queued span and log (4874 of 4874). Sink never answering: `close()` returns at the 2 s cap, with about 4300 spans and 8800 logs dropped and counted in `droppedAtClose`. Sink down: same 2 s cap, 4300-4600 spans dropped. Data is not silently lost: it appears in the dropped counters, but those are metrics that cannot be exported once the sink is gone.

## Findings

1. Pending-promise growth under a stalled sink (not fixed here). `enqueue` calls `void this.drain(signal)` for every item once the queue holds at least `maxBatch`, and `drain` does `state.chain = state.chain.then(() => this.sendQueued(signal))`. While one POST is stuck for up to 10 s (twice with the retry), the queue stays full, so every span and log appends another link to the chain. The queue itself is bounded and counts its drops, but the chain is not: heap after GC grew from 18 MB to 64-77 MB during a 55 s stall at 1500 req/s (about 100k links, roughly 500 bytes each) and RSS to 480-490 MB, and it grows linearly with stall time and request rate. It drains once the sink answers. Repro: `benchmarks/bench-telemetry-stress.ts failure` (the "accepts and never answers" case), or point the exporter at a socket that accepts and never responds and enqueue 100k spans. A fix would be to schedule at most one pending drain per signal (a `draining` flag) instead of chaining per enqueue.
2. RSS grows 60-100 MB under connection-refused and error-status faults while the JS heap is flat, so the growth is outside the JS heap (undici and socket buffers and allocator retention, not confirmed beyond that). It does not return to baseline after recovery.
3. Per-request id generation uses `crypto.randomFillSync` for each id (5% of L3 self time), and each nested protobuf message allocates a fresh 256-byte `Uint8Array` plus a copy through `finish()`. Both are cheap to improve (pooled random bytes, one writer with length back-patching).
4. Defaults are not free: at the default level L3 costs 125-180% extra CPU per request at this baseline, mostly protobuf encoding, the exporter's fetch and log scrubbing.

No crash and no request-path blocking was seen in any run.

## Recommendation

- Keep telemetry off by default (it is). When on, L1/L2 (spans and logs in process) cost about 35-80 us/request or 16-53% at these baselines; that is acceptable. The real exporter at L3 is where cost lives (about 220-315 us/request): budget a core's worth at roughly 1000 req/s per core.
- Where to look first: `otlp/protobuf-writer.ts` (per-message allocation, BigInt varints for tags and lengths), `otlp/otlp-encode.ts`, the exporter's per-POST fetch, `otlp-logger.ts` scrubbing and TextEncoder use, and id generation in `otlp-tracer.ts`.
- Fix the unbounded drain chain (finding 1) before recommending the exporter for production use against a sink that can stall.
- Add sampling (head sampling by ratio) if L3 is meant to run at high request rates; there is none.

## Caveats

- Shared, busy devbox (load 2-10); variance is 1-5% at L0 and up to about 8% at L3. Numbers are medians of 5, not a quiet-machine measurement.
- N1 is slow; absolute figures do not transfer to a modern x86 core, ratios mostly do.
- Node 24.22.3 was used instead of the system Node 22. Bun was not run.
- Main-vs-branch differences are within noise in some cells.
- The harness was updated (`sessionless` metadata, auth middleware removed) because the existing scenarios returned 401 on current main.
- Dependencies on devbox were a trimmed install (core built with tsc, autocannon, tsx).
- The controlplane receiver and Greptime ingest were out of scope and are not measured.
- Soak ran 6 minutes per level; a slow leak under 0.25 MB/min would need longer.
- Event-loop lag figures include a 10 ms histogram resolution floor, subtracted but approximate.
