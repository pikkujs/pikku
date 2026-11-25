---
type: decision
title: Per-request providers build after core's auditLog and stop in reverse order
description: A wire provider reads core's auditLog as optional, may not provide it, and every per-request service is torn down with stop(), last built first
tags: core
---

# Per-request providers build after core's auditLog and stop in reverse order

`runPikkuFunc` builds, in this order: core's invocation `auditLog` (only when the
function has an audit config and a singleton `audit` exists), the wire providers
the function reaches, then the project's `createWireServices` with the singleton
services and the provided wire keys. `auditLog` is therefore the one key a wire
provider may find already built, and it must list it in `optional`: the key is
absent whenever the function is not audited. A wire provider that provides
`auditLog`, `analytics`, `session` or `rpc` is refused at build (PKU399), so
core stays the only owner of what it builds for every invocation.

Teardown is one mechanism. When the call ends, the runner stops the project's wire
services (last built first), then the wire providers (latest provider first, one
`stop()` per object however many keys hold it). A failing `stop()` is logged and
does not stop the others. There is no `close()` alias: a wire service that still
defines `close()` is no longer closed.

A request builds only the wire providers its function reaches. The build resolves
the unit's providers once; the function's `services.services` list, when the
inspector could read it (`optimized`), selects at run time the providers that
provide one of those keys plus the keys those need. A function the inspector could
not read builds every provider of the unit. Addon functions never see the host's
wire providers: they keep their own `createWireServices`.

**What this rules out:** a wire provider replacing core's `auditLog`, and keeping
`close()` beside `stop()`. A wire key a singleton already holds is a build error
(PKU393); `shadows` is not implemented.
