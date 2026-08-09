---
type: decision
title: Wiring registries erase the generics their wire* functions capture
description: A registry is typed at unknown so every wiring shares one map; storing a generic config in it needs an assertion, because function parameters are contravariant
tags: core
---

# Wiring registries erase the generics their `wire*` functions capture

Every `wire*` entry point — `wireTrigger`, `wireTriggerSource`, `wireChannel`,
`wireQueueWorker`, and the rest — is generic in the shape a caller declares, so
the caller gets a checked `func`. The registry each one writes to is not:
`pikkuState(null, 'trigger', 'triggers')` is a
`Map<string, CoreTriggerSource>` where `CoreTriggerSource` fixes input and
output at `unknown`, because one map has to hold every trigger in the app.

Handing `CoreTriggerSource<TInput, TOutput>` to a slot typed
`CoreTriggerSource<unknown, unknown>` is not an upcast. `func` takes its input
as a *parameter*, and parameters are contravariant: a function that accepts
`TInput` cannot stand in for one that accepts `unknown`, since `unknown` admits
values `TInput` does not. TypeScript is right to reject it, and no variance
annotation makes it go away — the registry genuinely holds functions whose input
types it cannot name.

The runtime is nonetheless sound, because the only thing that ever invokes a
registered `func` is the function runner, which validates the incoming data
against that function's own generated schema before the call. The type the
registry lost is re-established at the call boundary by the schema, not by the
type system.

**What this rules out:** deleting these assertions as if they were noise — the
code does not compile without them. It equally rules out `as any` in their
place: `as any` discards the target type too, so a genuinely wrong config would
also slip through. Assert to the registry's own element type and let everything
except the erased generic stay checked.
