---
type: decision
title: An addon may reach only itself and the addons it declares in uses
description: An addon's call to another addon goes through the app's wireAddon uses, which maps the name the addon calls to the instance the app wired; an unmapped name is refused with AddonNotUsedError on every path (rpc, rpcWithWire, startWorkflow, agent run and stream, rpc.exposed), and an unknown addon header is refused outright
tags: core, addons, rpc, scopes
---

# An addon may reach only itself and the addons it declares in uses

**Server-side calls are mapped, not just checked.** `mapAddonCall` in
`packages/core/src/wirings/addon/addon-reach.ts` takes the calling addon and
the name it called (`addon-reach.ts:41-55`).

- A call from outside an addon, or with no namespace, is left as it is.
- A call to the addon's own namespace is left as it is.
- Any other prefix is looked up in the caller's `uses`, and the call is
  rewritten to the instance the app mapped it to: billing's `stripe:charge`
  becomes `payments:charge` when the app wrote `uses: { stripe: 'payments' }`.
- A prefix the app did not map throws `AddonNotUsedError` (403). That includes
  the wired name itself: billing calling `payments:charge` directly is refused,
  because the key it may use is `stripe`.

`ContextAwareRPCService` routes `rpc`, `rpcWithWire` and `startWorkflow`
through it (`mapUsedAddon`, `rpc-runner.ts:495-497`), and `createAgentRPC`
routes agent `run` and `stream` through it (`agent-rpc.ts:54`, `:73`). Agents
were the gap before: an addon could run any agent by its wired name.

**Why a mapping and not a check.** The addon is written once and wired by many
apps, each under names it cannot know. Its code calls the alias it declared in
its `package.json` (see the inspector note
`an-addon-declares-the-addons-it-calls`), and the app decides what the alias
reaches. The transport is the target instance's business: a `wireRemoteAddon`
target is called over HTTP by the same rewritten name.

**HTTP calls tagged with an addon header are checked.** `addonMayReach`
(`addon-reach.ts:7-13`) returns `true` for the caller's own namespace or a
target among the values of its `uses`. `addonCallerOf` refuses an addon header
naming an unregistered addon with `ForbiddenError` (`addon-reach.ts:15-22`).
`rpcExposed` applies it before resolving the function (`rpc-runner.ts:361-365`).

`AddonNotUsedError` and its registration live in `addon-reach.ts`, which is
why that module is in core's `sideEffects`; `rpc-runner.ts` re-exports it.

**What this rules out:** an addon reaching an addon the app did not map for
it, by alias or by the wired name; an agent call bypassing `uses`; and an addon
header naming an unregistered addon being treated as anonymous rather than
refused.
