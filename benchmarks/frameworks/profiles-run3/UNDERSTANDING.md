# Why Pikku L0 is slower than Elysia on one authenticated request (run3)

Branch feat/otlp-sink-registry (local). No tracked file was edited. All patching is done in-process by a Bun preload (`patches.ts`) that rewrites `@pikku/core/dist` modules in memory behind flags; a scratch copy of the route (`compiled.ts`) was built from the real Pikku pieces. Prior work: `../profiles-run2/REPORT.md` (not redone).

## 0. Headline (read this first)

- In-process, interleaved, 3 runs x 200 rounds x 300 requests, 16 variants per round: Pikku L0 ~112-119 us/req, Elysia ~99-104 us/req. Elysia is 11.6-12.6% faster (paired diff -13.0 to -14.5 us). That is the real in-process gap, not the 30 us of the earlier TCP matrix (that gap includes socket/HTTP-parsing and shared-library variance).
- Tiny flags barely matter. Individually, trace ids, channel-middleware, secretless Proxy, service Proxies, credential block, session accessors, LRU touch, route log are each 0 to -2.8 us, most inside noise. All nine together: -3.3 to -4.8 us (~3-4%).
- The one big single item is the bounded body reader: -4.8 to -5.8 us (~4.5-5%) on its own, with a caveat (section 5).
- All nine small flags + body fast path: -8.0 to -10.4 us (7-9%), about 60-70% of the gap.
- A "registration-time compiled route" (everything constant per route resolved once, plus the body fast path) reached Elysia's speed: -12.6 to -14.4 us vs control, a tie with Elysia (99.6/100.2/104.1 vs 99.2/100.6/103.8). Without the body fast path it saves -7.8 to -10.2 us.
- The design reason: Elysia compiles one function per route at registration; Pikku rebuilds, per request, things that are identical for every request to that route (middleware chain lookup, permission lookup, secretless views, proxies, closures, 25ish awaits). No single flag fixes that; the structural change does.

## 1. Timeline of one authenticated POST (L0, route with schema + one auth guard)

Route used: POST /api/items/r0, body `{"id":N}`, cookie auth via better-auth `getSession`, one `pikkuAuth` guard, returns JSON. L0 = `PIKKU_TELEMETRY=0`.

| # | Step | Pikku (file:line, core/src unless noted) | Elysia (generated handler, see scratchpad/elysia-dump.txt) | Pikku-only work |
|---|---|---|---|---|
| 1 | Server entry | `runtimes/bun-server/src/pikku-bun-server.ts:295-360`: single `fetch` handler, awaits upgrade check, health, mcp, `localContent` (:339), `serveStaticFiles` (:344) before routing. No native `routes`. | Bun.serve `routes` native dispatch (`elysia/dist/adapter/bun/index.mjs` ~:45-75) straight to the route handler | Several awaits/checks before routing |
| 2 | Wrap request | `new PikkuFetchHTTPRequest(req)` (:349; `wirings/http/pikku-fetch-http-request.ts:36` does `new URL`), `new PikkuFetchHTTPResponse` | Uses the native Request; `map(r)` does `indexOf` URL parse into one context literal | Wrapper objects, URL parse (~0.37 us) |
| 3 | Trace | `fetchData` `http-runner.ts:489` -> `resolveHTTPTrace` `trace.ts:86` -> `createTrace` `trace.ts:43` (2x `randomHex`, `trace.ts:29`) | none at L0 | ~0.65-0.75 us microbench, ~2 us e2e |
| 4 | HTTP wire | `createHTTPWire` (:497) | context literal `c` | small |
| 5 | Route match | `getMatchingRoute` `http-runner.ts:158` (static map lookup, ~19 ns) | `switch(p)` on path string in generated `map`, then `ht[1].composed(c)` | ~20-40 ns |
| 6 | executeRoute | `http-runner.ts:204`: `new PikkuSessionService` (:225), "Matched route" template log (:247-249), many closures, wire object, `createMiddlewareSessionWireProps` (:348) | none (already compiled) | closures + object build, ~0.1-0.2 us measured, GC extra |
| 7 | runPikkuFunc setup | `function-runner.ts:206-` ; `combineChannelMiddleware` (:347) ; `combineMiddleware` (:725) -> `middleware-runner.ts` `cacheGet` (:166) ; `openFunctionSpan` (:740) | `composed` reads closed-over `e.beforeHandle[]` | chain lookups per request |
| 8 | Credential wire | `function-runner.ts:374-393` `PikkuCredentialWireService` | none | ~50 ns, unused here |
| 9 | Middleware chain | `runMiddleware`; global `*` HTTP middleware `betterAuthSession` (`packages/services/better-auth/src/auth-session.ts:93`): `hasLiveSession` await, `services.auth()` await, `new Headers`, `mergeRelayedCookies`, `auth.api.getSession` (shared lib), `resolveAndSetSession` (`resolve-session.ts:75`, `withResolvedScopes`, `stampVirtualUserFlag`), `setInitialSession` | `await e.beforeHandle[0](c)` runs better-auth `getSession` (the same shared lib) | async hops + header copy (shared-lib cost not counted) |
| 10 | resolveSession | `function-runner.ts:87,471`; `createFunctionSessionWireProps` (:480) | none (session read from resolve) | ~0.1 us |
| 11 | Body read | `pikku-fetch-http-request.ts:83-107` `#readBoundedBuffer`: `getReader().read()` loop, `TextDecoder`, JSON.parse, `data()` `mergeRequestData` (:176) | `charCodeAt(12)` content-type switch, `await c.request.json()` native | **~6-9 us microbench vs 0.4-0.6 us native** |
| 12 | Validation | `function-runner.ts:559-575` `applyDefaultsFromSchema`, coerce, `validateSchema` (cfworker, ~0.39 us incl strip) | TypeBox `Clean/Check/Decode` BEFORE auth, at :134-137 in the dump | similar cost |
| 13 | Permission | `runPermissions` (:584) with `withoutSecrets` (:586), ~0.15 us | `await e.beforeHandle[1](c)` | ~0.05 us secretless Proxy |
| 14 | Services for func | `function-runner.ts:~630-705`: second `withoutSecrets`, three Proxies (`traceQueueService`, `traceSchedulerService`, `traceWebhookService`), `defineProperty` analytics (:662) and rpc (:680) | handler called directly with `c` | ~0.15-0.3 us + GC |
| 15 | Handler | the benchmark function | handler | none |
| 16 | Response | `toResponse` `pikku-fetch-http-response.ts:130` | `mapCompactResponse` | ~0.15 us |

Await count (inferred by reading, not instrumented): ~25 awaits in Pikku vs ~6 in Elysia. At ~21 ns per resolved await plus allocation (microbench), that is ~0.5 us direct; the larger effect is promise/closure allocation and GC.

## 2. Measured cost per Pikku-only step

Two measurements; they disagree in magnitude for a known reason: microbenchmarks (tight loop, `micro.ts`) miss GC and allocation costs; the e2e flag test (`inproc.ts`) includes them but has +/-1 us noise at this load.

Microbench (Bun.nanoseconds, booted app, min-max over repeats): createTrace 650-750 ns; resolveHTTPTrace 660-770; combineChannelMiddleware steady-state 27-33 ns; combineMiddleware with LRU 22-26 ns (Map get+delete+set 19-33 ns vs get alone 4 ns); withoutSecrets 50 ns; createSessionAccessors 18 ns; createMiddlewareSessionWireProps 51; createFunctionSessionWireProps 101; credential wire 52; three Proxy creations ~17 each; Matched-route log 28 ns; `new URL` 48 ns; validateSchema 387 ns; runPermissions 155 ns; await 21 ns.
Body: pikku `req.data()` 5.9 us (4.4-11) vs native `req.json()` 0.43 us; `arrayBuffer()` bounded 7.3 us vs native 0.57 us.

E2E paired diff vs control, median over the paired rounds (3 runs x 200 rounds x 300 req; us/req, negative = faster). Load1 at start/end of runs: 5.0->8.3, 8.3->5.2, 5.2->5.9 (machine never idle, 10 users).

| flag | run1 | run2 | run3 | verdict |
|---|---|---|---|---|
| trace (static trace) | -2.31 | -2.76 | -1.66 | real, ~2 us |
| cc (skip combineChannelMiddleware) | -0.99 | -0.19 | +0.58 | noise |
| sec (withoutSecrets identity) | -1.13 | -1.75 | +0.09 | noise to ~1 |
| prox (3 trace*Service Proxies off) | -1.17 | -0.34 | +0.17 | noise |
| svc (skip proxies/spreads/analytics getter) | -1.83 | -1.03 | +0.18 | ~0.5-1 |
| cred (skip credential block) | -0.86 | -0.43 | +0.53 | noise |
| sess (cache session accessors) | -0.71 | -0.03 | -0.09 | noise |
| lru (skip delete+set) | -0.39 | +0.11 | +0.47 | zero |
| log (skip route log string) | -0.45 | -0.98 | -0.16 | noise |
| body (fast path arrayBuffer) | -5.76 | -4.84 | -4.99 | real, ~5 us |
| allNoBody (9 small flags) | -4.77 | -3.32 | -3.51 | ~4 us |
| allPlusBody | -10.44 | -9.89 | -8.02 | ~9 us |
| compiled route (+body) | -14.35 | -13.91 | -12.59 | = Elysia |
| compiled route (no body) | -10.18 | -8.12 | -7.81 | ~8.7 us |
| elysia | -14.54 | -13.49 | -13.00 | reference |

Control medians (wall us/req): 119.3, 113.6, 112.0. Spread (p25-p75 per variant): 8-30 us wide in loaded runs, so the per-round paired diff is the only usable statistic and single flags under ~1.5 us cannot be resolved. All 16 variants passed conformance in all 3 runs (200 ok, 401 no cookie, 403 denied, 422 bad input, 401 after session delete, 200 restored). Elysia's "afterDelete" is checked against its own DB copy; that harness check is meaningful per variant only for Pikku.

Each summed-flag figure is less than the sum of the individual flags, and individual flags are less than the microbench would predict in some cases and more in others (trace: micro 0.7 us, e2e ~2 us). That is allocation/GC, which the microbench omits.

## 3. Verifications

- Who calls `combineChannelMiddleware` on the HTTP path: `runPikkuFunc` at `function-runner.ts:347` calls it for every wire type, not only channels. In steady state it is a cache hit (27-33 ns), so run2's 2.3 us attribution was a profile misattribution (first-call/cache-miss samples). Skipping it on non-channel wires saves under 1 us e2e (noise). Why it exists: channel wires carry per-channel middleware; for other wires the result is an empty list. Safe and cheap to skip when `wire.channel` is undefined, but not worth much.
- Middleware LRU (`middleware-runner.ts:166-175`): yes, each hit does `get` + `delete` + `set` to move the entry to the newest slot (cap 4096). Microbench 19 ns at size 1, 33 ns at size 30, versus 4 ns for get alone. E2E flag `lru`: 0 (-0.4/+0.1/+0.5). Negligible.
- Precomputed per-function / per-route handler: none found. Searched http-runner, function-runner, middleware and permission runners, `PathToRegexRouter` (`wirings/http/routers/path-to-regex.ts:16`, which only precompiles the path matcher: a static-route Map plus path-to-regexp matchers). Middleware chains and permission lists are cached by key (a lookup per request); schemas are compiled once and looked up by name per request; everything else is rebuilt per request.

## 4. Pikku-only steps: classification and designs (ranked by measured saving)

| Rank | Step | Class | Design | Measured saving | Risk | Where |
|---|---|---|---|---|---|---|
| 1 | Bounded body read | essential (size limit) but implementation is slow | When `content-length` is present and <= maxBodySize, use `await request.arrayBuffer()` then check; fall back to the reader loop for chunked/no-length. | ~5 us e2e (-4.8 to -5.8), 6-9 us micro | Medium: a lying content-length with a large body is only caught after buffering; mitigate by `arrayBuffer().byteLength` check and server-level `maxRequestBodySize` in `Bun.serve` | `pikku-fetch-http-request.ts:83-107` |
| 2 | Trace id creation | optional at L0 | Lazy getter on the trace: generate ids only on first read (response header, log, span, outgoing call) or when a tracer/sink is active or traceparent present | ~2 us (-1.7 to -2.8) | Medium: id echoed in logs/errors must be stable once read | `trace.ts:29-43,86`; `http-runner.ts:489` |
| 3 | Per-request service views (double `withoutSecrets`, 3 Proxies, analytics/rpc `defineProperty`) | precomputable | Build secretless view and Proxied queue/scheduler/webhook once per singleton-services object when no per-wire override (WeakMap), per-wire only when a wire supplies its own services | ~0.5-1 us (svc), within noise individually | Low-medium: secret scoping per wire must stay | `function-runner.ts:586,~630-705`; `services/secretless.ts:19-35` |
| 4 | Credential wire, session accessors (built twice), route log string | precomputable / lazy | Create credential wire only if credentials requested for the function; cache accessors per session service; build log string only when info enabled | ~0.5 us combined, unresolved individually | Low | `function-runner.ts:374-393`; `user-session-service.ts`; `http-runner.ts:247` |
| 5 | combineChannelMiddleware, LRU touch | optional | Skip for non-channel wires; use get-only on hit (accept FIFO) | <= 0.5 us, noise | Low | `function-runner.ts:347`; `middleware-runner.ts:166` |
| 6 | Server pre-routing awaits (static, localContent, mcp, upgrade) | precomputable | Register only the handlers that exist; use `Bun.serve` `routes` for the known API routes | not measured (harness calls `server.fetch`, which includes these awaits already; so unmeasured part is only the native `routes` dispatch) | Medium | `pikku-bun-server.ts:295-360` |

### What a registration-time compiled route looks like

For each (method, route) at `wire` time, resolve once: the middleware array (`combineMiddleware`, including global and addon middleware), the permission function list, the schema key plus compiled validator and default/coercion plan, the secretless service view, the function's services pick, the function meta. Per request there remains: build wire (request, response, session service), run the middleware array, read the body (fast path), validate, run permissions, call the function, convert the response. `compiled.ts` in this directory is such a scratch route (about 70 lines) for the benchmark shape; it reuses the real middleware (`betterAuthSession`), `PikkuFetchHTTPRequest/Response`, `PikkuSessionService`, schema service, permission functions and `handleHTTPError`.

Measured: compiled (with body fast path) equals Elysia within noise in all three runs (-14.35/-13.91/-12.59 vs elysia -14.54/-13.49/-13.00), so it can remove essentially the whole in-process gap (the ~12-14 us; the earlier "~17 us framework-owned" figure was a profile estimate). Without the body fast path it removes ~8-10 us. So of the gap: ~5 us body, ~9 us structure (small flags are 3-4 of that), consistent with the combined flags (-8 to -10).

This is an UPPER BOUND, not a drop-in: it omits audit, rpc, credential wiring, wire services, scopes, feature flags, workflows, telemetry spans (L0 only), channel and addon wiring. Real implementation must precompute those conditionally (flag per feature, resolved at registration) so a route using them takes the slow path. Conformance of `compiled` passed the same six checks, including 403, 422 and revoked-session 401.

## 5. Measured vs inferred, noise, and what I could not verify

Measured: everything in the section 2 tables (e2e paired diffs, microbenchmarks, conformance); the Elysia generated code (dumped from the running app); callers/LRU/precompute findings (read from code and microbench).

Inferred: await count (~25 vs ~6, read from code, not instrumented); the classification and risk comments; that per-request GC drives e2e > microbench.

Noise: shared machine, 10 users, load1 5.0-8.3 during runs (uptime captured at each run start/end). Per-batch spread is +/-5 us; the paired design over 200 rounds gives roughly +/-1 us on the median diffs, so any single-flag effect under ~1.5 us (cc, sec, prox, cred, sess, lru, log) is not distinguishable from zero. Run1 saw the highest load and shows slightly larger apparent effects.

Could not verify:
1. The body fast path is measured with an in-process `Request` that has a string body (already buffered). On the real server the body is a socket stream; `arrayBuffer()` vs the reader loop may differ there. Needs a TCP A/B before claiming 5 us.
2. Elysia comparison is in-process `app.fetch`, not through Bun's native `routes`, so Bun-routes savings and kernel/socket costs are excluded. The earlier TCP matrix gap (~28-30 us) vs in-process (~13 us) is not reconciled here; I did not run a TCP A/B of the patched variants.
3. Not tested: L1+ telemetry, N=30 routes, other route shapes (no auth, GET, streaming, workflows), Node runtime.
4. The compiled route skips features listed above; its speed is not a promise for the full feature set.

## Files
- `patches.ts`, `inproc.ts`, `stats.ts`, `micro.ts`, `compiled.ts`, `elysia-app.ts`, `elysia-dump.ts`, `seed-run.ts` in this directory.
- Raw outputs in the session scratchpad: f1/f2/f3 (.json, .wall.txt, .cpu.txt, .err, .load0/.load1), micro1.txt, micro2.txt, elysia-dump.txt.
- Repro: `bun --preload ./patches.ts inproc.ts <workdir> '<variants json>' 200 300`.
