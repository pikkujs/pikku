---
type: decision
title: An upload is counted as it arrives, not buffered and then measured
description: Reading the whole body before checking its size hands an unauthenticated caller a way to spend the server's memory
tags: core, content
---

# An upload is counted as it arrives, not buffered and then measured

The local content request handler accumulates the request body chunk by chunk,
tracking the running total, and abandons the read the moment it crosses the
limit. An oversized upload therefore costs the limit, not its own size.

The obvious alternative — `await request.arrayBuffer()` and then check
`byteLength` — has to hold the entire body in memory before it can decide the
body is too large. For an endpoint reachable before authentication that is a
way to spend the server's memory for the price of one request, and no size limit
configured anywhere prevents it.

`readRequestBody` in the node HTTP server aborts on the same terms, for the same
reason.

**What this rules out:** replacing the streaming accumulation with a single
buffered read because the limit check "still happens".
