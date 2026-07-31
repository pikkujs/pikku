---
type: decision
title: Trigger declaration is split from trigger source
description: Triggers are declared everywhere but subscribed only in the trigger worker, so app processes never open the underlying subscription
tags: trigger
---

# Trigger declaration is split from trigger source

`wireTrigger` and `wireTriggerSource` in
`packages/core/src/wirings/trigger/trigger-runner.ts` are deliberately two
separate registrations for the same trigger name. `wireTrigger` declares the
trigger name and the target pikku function; it is meant to be loaded by every
process, because the inspector extracts it at build time and every runtime needs
the name-to-function mapping in `pikkuState(null, 'trigger', 'meta')`.
`wireTriggerSource` carries the actual subscription implementation
(`CorePikkuTriggerFunction`, which opens the connection and returns a teardown)
and is only imported by the trigger worker process.

The split exists because the subscription has side effects at import-and-setup
time — a Redis `subscribe`, a socket, a poller. If every API instance loaded the
source, every instance would open its own subscription and the trigger would fire
once per instance instead of once per event. Keeping the source out of the
general bundle also keeps the trigger's transport dependency out of runtimes that
never need it. `CoreTriggerSource.name` must therefore match a `wireTrigger`
name exactly; nothing in the type system enforces that, and a mismatch shows up
only at `setupTrigger` time as `Trigger source not found`.

**What this rules out:** merging `wireTrigger` and `wireTriggerSource` into one
registration call, re-exporting trigger sources from a package barrel that
application code imports, or "simplifying" by having `wireTrigger` accept the
subscription function directly. Any of these pulls the subscription into every
process and silently multiplies trigger firings by the instance count.
