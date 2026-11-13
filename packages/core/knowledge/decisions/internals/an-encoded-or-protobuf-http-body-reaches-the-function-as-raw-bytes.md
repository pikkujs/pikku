---
type: decision
title: An encoded or protobuf HTTP body reaches the function as raw bytes
description: A body with a non-identity content-encoding, or an application/x-protobuf body, is passed through as { data: ArrayBuffer } and never decoded by core
tags: http
---

# An encoded or protobuf HTTP body reaches the function as raw bytes

The runner reads the body before the function runs, so a body core cannot parse
would fail with a 422 before the function could decode it itself.
`PikkuFetchHTTPRequest.body()` therefore treats `application/x-protobuf` like
`application/octet-stream`, and any body whose `content-encoding` is present and
not `identity` the same way, as `{ data: ArrayBuffer }`. The encoding check runs
first, so gzip-compressed JSON stays compressed bytes rather than failing
`JSON.parse`.

Core does not decompress and does not know protobuf. The function that wants the
body decodes it, which keeps those formats and their dependencies out of core.
No runtime adapter built on the fetch request decompresses or strips
`content-encoding` (node, uWS, Bun, Cloudflare, Lambda, Azure, Next), so the
header and the compressed bytes arrive together. The Express and Fastify
adapters have their own request classes and their parsers are unchanged.

The body size limit applies to the bytes on the wire, as before.

**What this rules out:** auto-decoding gzip in core, adding a protobuf parser to
core, and relying on `content-encoding` being ignored for JSON.
