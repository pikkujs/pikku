---
type: decision
title: The unauthenticated channel boot-failure route answers only a stage
description: When a channel fails to boot, the unauthenticated response names the failing stage and keeps the error text in the log
tags: [cloudflare, channels, errors]
---

# The unauthenticated channel boot-failure route answers only a stage

`channelBootFailure` in `packages/runtimes/cloudflare/src/handler-factories.ts`
(lines 510-523) logs the full error with `console.error` (line 514). The response
body carries only `ok: false`, the `stage`, and the text `Channel unavailable`
(lines 515-521), with status 503.

The stage is one of `singleton-services` or `durable-object` (line 511). The
callers are at lines 543 and 564.

The comment at lines 503-508 gives the reason. The route is unauthenticated, and a
failing service's error message "routinely carries the connection string that
failed, credentials included". The stage is the part that is safe to hand out.

**What this rules out:** returning the error message from an unauthenticated boot
failure.
