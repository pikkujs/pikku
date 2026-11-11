---
type: decision
title: An inline wiring function is sessionless unless its helper is pikkuFunc
description: The inspector derives sessionless for a function inlined into a wiring from the name of the helper that built it
tags: [inspector, functions, auth]
---

# An inline wiring function is sessionless unless its helper is pikkuFunc

`ensureInlineWiringFunction` in `packages/inspector/src/utils/ensure-function-metadata.ts`
registers metadata for a function written inline in a wiring (lines 329-344). The comment at
lines 324-327 says the stub would otherwise carry no session info, and the runtime would then
require a session for every call.

After that, if the metadata's `sessionless` is still `undefined` (line 349) and the initializer
is a call whose callee is a plain identifier (lines 350-351), `sessionless` is set to
`callee !== 'pikkuFunc'` (line 353), where the callee is the helper it resolves to rather than
its spelling, so an aliased `pikkuFunc` still requires a session
([resolution](a-pikku-helper-is-identified-by-what-its-callee-resolves-to.md)). The comment at
lines 324-327 gives the same rule as the one `addFunctions` applies to named functions.

If the callee is not a plain identifier, `sessionless` is left `undefined`.

**What this rules out:** treating an inline wiring function as session-required because it was
built by a helper other than `pikkuFunc`.
