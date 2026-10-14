---
type: decision
title: Trigger source functions are gated by admin:triggers:manage, and the list by admin:triggers:read
description: Setting up, removing, disabling and forgetting trigger sources all need admin:triggers:manage, and only listing needs the read scope; forget leaves the provider registration in place
tags: admin, triggers, scopes
---

# Trigger source functions are gated by admin:triggers:manage, and the list by admin:triggers:read

Four functions change trigger sources, and each declares `scopes: ['admin:triggers:manage']`:

- `trigger-source-reconcile.function.ts:15`, which registers the declared sources
  with their providers.
- `trigger-source-teardown.function.ts:15`, which removes named sources from their
  providers.
- `trigger-source-disable.function.ts:15`, which stops a source receiving and then
  removes it from its provider.
- `trigger-source-forget.function.ts:12`, which drops a record of an orphaned source.

`trigger-source-list.function.ts:13` is the one read, and declares
`scopes: ['admin:triggers:read']`.

The scope descriptions are in `packages/addon/pikku-admin/src/scopes.ts:68-79`: the
read scope is "View trigger sources and what they registered", and the manage scope
is "Set up and remove trigger sources with their providers".

Two descriptions state what each removal does:

- Teardown (`trigger-source-teardown.function.ts:13`) says only the code that set a
  source up can remove it, so it is run on the outgoing deployment.
- Forget (`trigger-source-forget.function.ts:10`) says it drops only the record, and
  its provider registration "has to be removed by hand." The function body
  (`trigger-source-forget.function.ts:13-16`) calls only `deleteTriggerSource(name)`.

`packages/addon/pikku-admin/src/lib/require-trigger-source-store.ts:6-8` throws
`No triggerSourceStore is configured` when no store is wired.

**What this rules out:** a trigger source change under the read-only grant, and
`forget` removing a provider registration.
