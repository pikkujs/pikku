---
type: decision
title: HTTP request bodies are read once and shared between consumers
description: The fetch request wrapper memoises the single-use body and builds web Requests lazily, at the cost of holding the whole body in memory
tags: http
---

# HTTP request bodies are read once and shared between consumers

A fetch `Request` body is a single-use stream: the second reader gets "Body has
already been used". `PikkuFetchHTTPRequest` in
`packages/core/src/wirings/http/pikku-fetch-http-request.ts` therefore funnels
`json()`, `arrayBuffer()`, `data()` and everything reached through
`toWebRequest()` into `#readRawBuffer`, which memoises both the in-flight promise
and the resolved buffer. A second consumer arriving while the first read is still
running is served the same promise — and warned, because a duplicate consumer is
a bug to remove at the source rather than a case to lean on the cache for.

`toWebRequest` in `packages/core/src/wirings/http/web-request.ts` builds its body
stream with `pull` rather than `start`, so the underlying body is touched only
when the stream is actually consumed. A caller that constructs a web `Request`
purely to read headers — session middleware calling `getSession({ headers })` is
the common case — performs zero body I/O and cannot race the route handler's own
read. Its fallback path exists because some runtimes (Express with a body-parser
in front) hand pikku a request whose raw body is already drained; there
`arrayBuffer()` is empty and the body has to be reconstructed from the parsed
form or JSON.

**What this rules out:** calling `request.arrayBuffer()`/`request.json()` on the
underlying fetch `Request` directly anywhere in the runner; switching the
`toWebRequest` stream to `start` for eagerness; and deleting the empty-buffer
reconstruction branch as an impossible case.
