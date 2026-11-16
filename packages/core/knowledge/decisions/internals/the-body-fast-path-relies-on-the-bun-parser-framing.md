---
type: decision
title: The body fast path relies on the Bun parser framing
description: A request with a strict-digits content-length within the limit and no transfer-encoding is read with the native arrayBuffer; everything else uses the bounded reader
tags: core, http, performance
---

# The body fast path relies on the Bun parser framing

`PikkuFetchHTTPRequest` reads a body through the bounded reader loop, which counts
bytes and cancels the stream the moment the limit is crossed. On Bun that loop
costs about 6 to 9 microseconds against about 0.5 for the native
`request.arrayBuffer()`, which is roughly 5 microseconds of an authenticated
request.

The native read is opt-in. `PikkuFetchHTTPRequestOptions.trustedFraming` defaults
to false, and only `PikkuBunServer` sets it (`packages/runtimes/bun-server`). Every
other adapter, and any caller that wraps a `Request` itself, keeps the bounded
reader. With `trustedFraming` set, the native read is used only when all of these
hold:

- `content-length` is present and strictly digits (`/^\d+$/`), and no larger than
  `maxBodySize` (a larger declared size is a 413 before any read, as before);
- there is no `transfer-encoding` header.

A missing, malformed (`+7`, `0x7`, `-7`, `7, 7`) or chunked body takes the bounded
reader unchanged. After the native read the byte length is checked against the
limit again, so a body longer than it declared is still a 413.

## Why this is safe, and where it is not proven

The safety comes from the server, not from the native read. Bun's HTTP parser
does all framing before the fetch handler runs: it rejects a negative,
non-numeric or conflicting `content-length`, rejects `content-length` together
with `transfer-encoding`, and never hands the handler more than
`content-length` bytes. A client that lies about the length cannot change what
`arrayBuffer()` returns. Measured on Bun 1.4.3 over TCP with raw sockets: the
current reader and the fast path behaved identically in every case (short body
with a stalled client, oversize declared length, chunked, duplicate headers,
`content-length` plus `transfer-encoding`), and a stalled client is closed by
Bun's idle timeout either way.

Node, Workers, HTTP/2 and the fastify and express request shims were not tested,
which is why they do not get the flag. A runtime that wants it must first show its
server enforces framing before the handler runs. The post-read size check still
keeps the limit if a runtime misbehaves.
Memory for a body that is declared within the limit but delivered larger is held
until the check, which is the cost of the fast path and the reason it is gated on
a declared length.
