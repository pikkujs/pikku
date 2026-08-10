---
type: decision
title: A permission gets a wire it cannot reply on
description: The permission wire is typed with Out = never so a permission cannot send on the channel; that narrowing is not a subtype, so the call site asserts
tags: core, permissions
---

# A permission gets a wire it cannot reply on

`CorePikkuPermission` in `packages/core/src/function/functions.types.ts` types
its wire as `PikkuWire<In, never, false, any, PikkuRPC, never, never>`. The
second parameter is `Out`, and `never` there is deliberate: it makes
`wire.channel` a `PikkuChannel<unknown, never, …>`, whose `send` accepts
nothing. A permission is a gate — it answers `true` or `false` — and must not
be able to write a reply to the caller it is deciding about. A permission that
could `send` would be able to leak the very data the gate exists to withhold,
and it would do so before the function it guards has run.

`runPikkuFunc` holds an ordinary `PikkuWire`, whose default `Out` is `unknown`.
`unknown` is not assignable to `never`, and `send` is contravariant in its
argument, so the narrowing cannot be expressed as a subtype relation — the call
into `runPermissions` asserts to the exact permission-wire type rather than
relying on assignability.

**What this rules out:** widening `Out` on the permission wire to `unknown` to
delete the assertion. That silently hands every permission function a working
`channel.send`. It equally rules out replacing the assertion with `as any`,
which erases the target type and hides the fact that a specific, intentional
narrowing is happening.

The same reasoning explains the `never` in the fifth and sixth positions
(`MCPTools`, `IsChannel`): a permission is not an MCP tool host and does not own
the channel lifecycle.
