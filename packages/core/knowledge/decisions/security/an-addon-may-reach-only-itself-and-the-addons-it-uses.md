---
type: decision
title: An addon may reach only itself and the addons it declares in uses
description: An RPC call that arrives tagged with an addon header is refused unless the target is the caller or one of the caller's declared uses, and an unknown addon name is refused outright
tags: core, addons, rpc, scopes
---

# An addon may reach only itself and the addons it declares in uses

`addonMayReach` in `packages/core/src/wirings/addon/addon-reach.ts` takes the caller addon and the target function name (`addon-reach.ts:6`). It takes the target from the part of the name before `:` (`addon-reach.ts:7`). It returns `false` for an empty target (`:8`), `true` when the target is the caller (`:9`), and otherwise `true` only when the caller's declared `uses` includes the target (`:10-11`).

`addonCallerOf` reads the addon header from the HTTP request (`addon-reach.ts:14-16`). A name that is not a registered addon is refused with `ForbiddenError` (`addon-reach.ts:17-18`).

`ContextAwareRPCService.rpcExposed` applies the check before resolving the function. A caller that fails `addonMayReach` gets `AddonNotUsedError` (`packages/core/src/wirings/rpc/rpc-runner.ts:189-192`).

**What this rules out:** an addon calling into another addon it does not declare in `uses`, and an addon header naming an unregistered addon being treated as anonymous rather than refused.
