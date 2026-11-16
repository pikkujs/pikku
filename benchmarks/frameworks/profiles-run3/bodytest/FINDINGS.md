# Body-read fast path: safety + cost (Bun 1.4.3, real TCP, raw net clients)

Scripts: server.ts (modes current|fast|bounded), raw.ts, cases.ts, extra.ts, bench.ts; raw outputs *.txt.
"current" = the real `PikkuFetchHTTPRequest(req,{maxBodySize:1024}).json()` imported from core src, inside a
scratch Bun.serve (NOT via PikkuBunServer/fetchData; the bun-server constructs `new PikkuFetchHTTPRequest(req)` with
no options, so it uses DEFAULT_MAX_BODY_SIZE = 10 MB and Bun's default maxRequestBodySize is untouched).
"fast" = scratch copy: if content-length present, matches /^\d+$/, <= max, and no transfer-encoding -> `req.arrayBuffer()`
(+ post-check byteLength <= max); otherwise falls through to the bounded reader. No repo file was changed.

## Key finding

Bun's HTTP parser (uWS) does ALL framing before the fetch handler runs: it rejects bad/negative/non-numeric/duplicate-
conflicting content-length and CL+TE together (400, connection closed), and it never hands the handler more than
content-length bytes. `req.arrayBuffer()` therefore cannot over-read, and a lying client cannot change what the handler
sees. Current and fast path behaved identically in every case below.

## Per-case results (MEASURED, both paths)

| #        | Case                                                               | Current                                                                                                                                                                                                                   | Fast path                                                | Safe                                                          |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| 1        | CL smaller than bytes sent (`GET /smuggled` appended)              | handler reads exactly CL bytes; extra bytes parsed by Bun as a separate pipelined request (handler saw 2nd request `GET /smuggled`, a normal HTTP/1.1 pipeline, same as any server); garbage tail: no response, no effect | identical                                                | yes                                                           |
| 2        | CL=500, 7 bytes sent, stall                                        | no response; Bun idleTimeout (default 10s) closes the socket (closed within 16s window; exact second not pinned); 200 stalled conns = ~1-6 MB RSS, noise level, released after timeout                                    | identical (read just waits on the same stream)           | yes (bounded by idleTimeout; slowloris cost same as current)  |
| 2b       | same, client closes                                                | socket closes, no response, no leak seen                                                                                                                                                                                  | identical                                                | yes                                                           |
| 3        | CL=5000 > max 1024, only 6 body bytes sent                         | Pikku 413 in ~1 ms from header alone, body not awaited                                                                                                                                                                    | identical (guard falls through to existing header check) | yes                                                           |
| 4        | chunked, no CL, 1800 B > 1024                                      | 413 after 2nd chunk                                                                                                                                                                                                       | identical (falls to bounded reader)                      | yes                                                           |
| 4c       | chunked 64 x 1 MB, max 1 KB                                        | 413, server RSS delta ~0.5 MB                                                                                                                                                                                             | identical                                                | yes (memory bounded)                                          |
| 5a       | CL=10 GB, tiny body                                                | Bun answers 413 itself (Connection: close), handler never runs                                                                                                                                                            | identical                                                | yes                                                           |
| 5b       | CL=2^64                                                            | Bun 400                                                                                                                                                                                                                   | identical                                                | yes                                                           |
| 6a-b,h,i | CL=-5 / abc / +7 / 0x7                                             | Bun 400, close, handler not run                                                                                                                                                                                           | identical                                                | yes                                                           |
| 6c       | dup CL 7,7                                                         | 200, body read OK                                                                                                                                                                                                         | identical                                                | yes                                                           |
| 6d-e     | dup CL 7,500 / 500,7                                               | Bun 400, close                                                                                                                                                                                                            | identical                                                | yes                                                           |
| 6f-g     | CL + TE chunked together (incl. smuggle attempt, big chunked body) | Bun 400, close, handler not run                                                                                                                                                                                           | identical                                                | yes                                                           |
| 7        | Bun maxRequestBodySize                                             | default 128 MB: CL=128MiB reaches handler, 128MiB+1 gets Bun 413 before Pikku; Pikku limit is independent and tighter                                                                                                     | identical                                                | yes (Bun cap is a backstop only; Pikku's cap is what matters) |

## Recommended guard conditions for the fast path

1. `content-length` header present, matches `^\d+$` (strict digits), `Number(cl) <= maxBodySize` (and safe integer).
2. No `transfer-encoding` header (belt and braces; Bun already rejects CL+TE).
3. Otherwise (absent, malformed, over limit, chunked) use the existing bounded reader / existing 413 path unchanged.
4. After `arrayBuffer()`, still check `byteLength <= maxBodySize` (cheap; defends against a runtime that does not
   enforce framing, e.g. Node/other adapters, or HTTP/2 where CL is advisory).
5. Keep it per-runtime opt-in or verify on each adapter: the safety here comes from Bun's parser, not from the
   native read. Other runtimes (Node undici/fastify web-request shims, Workers) were NOT tested.

## CPU per request (MEASURED; real sockets, 16 keep-alive conns, ~190 B JSON body, 3 s per run, 9 interleaved rounds)

Server CPU us/req = process.cpuUsage() delta / requests. Load average rose 2.3 -> 9.5 during the run (shared box, other sessions), so absolute numbers are noisy; interleaving makes the ordering reliable.

| variant                                                                                                                 | runs (us/req)                                | median | rps median |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ | ---------- |
| current (Pikku class + bounded reader + TextDecoder)                                                                    | 18.3 18.4 23.8 19.0 23.2 23.2 24.2 27.3 31.2 | 23.2   | 47k        |
| bounded reader only (scratch, no Pikku class)                                                                           | 15.9 15.2 16.4 18.2 19.3 19.5 20.7 19.5 23.9 | 19.3   | 61k        |
| fast (native arrayBuffer, no class)                                                                                     | 6.8 8.8 8.3 8.8 11.0 12.9 13.7 10.3 15.2     | 10.3   | 86k        |
| An earlier 2-way run (load 2-7) gave current 21.1 vs fast 7.7 us/req. Native read saves ~9 us/req over the bounded loop |
| (~45-55%); a further ~4 us is the Pikku class/URL overhead that the fast variant also skipped, so the fast variant here |
| is a best case: a real in-class fast path would land between 10 and 19 us.                                              |

## Measured vs inferred

- Measured: every row above, Bun 1.4.3, TCP, 127.0.0.1; CPU table.
- Inferred: stall close time = Bun default idleTimeout 10 s (observed only "closed <= 16 s"); the safety on other
  runtimes/HTTP2; behaviour above 128 MB; that handler promise for stalled reads rejects/cleans on socket close (not
  inspected, no leak observed in RSS).
- Not tested: PikkuBunServer end to end (fetchData, middleware), TLS, HTTP/2, request bodies over 20 MB.
