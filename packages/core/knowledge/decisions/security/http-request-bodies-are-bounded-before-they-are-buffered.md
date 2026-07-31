---
type: decision
title: HTTP request bodies are bounded before they are buffered
description: Content-Length is rejected up front and the stream is measured as it arrives, because that header is optional and attacker-controlled
tags: http
---

# HTTP request bodies are bounded before they are buffered

`PikkuFetchHTTPRequest.#readBoundedBuffer` in
`packages/core/src/wirings/http/pikku-fetch-http-request.ts` enforces
`maxBodySize` twice. A declared `content-length` above the limit is rejected
before a single byte is transferred, which is the cheap path. The body stream is
then measured chunk by chunk anyway, cancelling the reader and throwing
`PayloadTooLargeError` the moment the running total crosses the limit — because
`content-length` is optional (chunked encoding omits it) and, when present, is
whatever the client chose to write. Trusting it alone would let a request declare
1 KB and stream a gigabyte.

`DEFAULT_MAX_BODY_SIZE` is 10 MB: ample for JSON APIs and ordinary uploads while
keeping one request's memory footprint bounded, since the whole body is
materialised in memory.

Every adapter enforces the same limit and the same `PayloadTooLargeError`, but
they divide into two kinds, and the difference is what can actually be
prevented rather than merely reported:

- **Prevention.** uWebSockets drives `res.onData` itself, so it counts bytes and
  *drops* chunks past the limit rather than concatenating, replying 413 before
  routing — the only point at which the buffering can be stopped, which is why
  it deviates from the fetch adapter's 404-an-unmatched-route order. Fastify
  delegates to native `bodyLimit`, set only when `maxBodySize` is configured so
  the default never *loosens* fastify's stricter 1 MB. `PikkuExpressServer`
  feeds the limit into `express.json`/`text`/`urlencoded`.
- **Rejection only.** `express-middleware` is handed an already-parsed body, so
  its guard makes the rejection uniform but cannot reclaim the memory; a
  deployment mounting it on its own app must bound its own parser. Next server
  actions receive a decoded JS value with no wire size left to measure — the
  limit there is `experimental.serverActions.bodySizeLimit`.

**What this rules out:** dropping the streaming measurement once the
`content-length` check exists; raising the default because "10 MB is small" —
raise it per-route via `maxBodySize` instead; reading the body with a plain
`request.arrayBuffer()` anywhere that bypasses this method; and adding an
adapter that buffers a body without a bound, on the assumption that some layer
downstream will catch it.
