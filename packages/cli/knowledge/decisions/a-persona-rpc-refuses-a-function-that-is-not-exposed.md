---
type: decision
title: pikku persona rpc refuses a function that is not exposed, before it signs in
description: The persona rpc command checks the RPC is exposed before it resolves credentials or signs anyone in
tags: cli, personas, rpc
---

# pikku persona rpc refuses a function that is not exposed, before it signs in

`personaRpc` in `packages/cli/src/functions/commands/persona-rpc.ts` looks the
requested RPC up in `state.rpc.exposedMeta` and throws when it is missing. The
check comes before `resolvePersonaCredentials` and `createHttpPersonas`, so no
credential is read and no session is opened for a call that cannot reach a route.

The message depends on the cause. A function that is declared but not exposed is
reported as having no route, and the message says to add `expose: true`. A name
that is not in the exposed set at all gets a "did you mean" list. Both match what
the HTTP surface can reach, the same surface the
[expose selects the RPC surface](../../../core/knowledge/decisions/security/wire-addon-expose-selects-the-rpc-surface.md)
note describes for addons.

**What this rules out:** using a persona's credentials to call a function that the
app does not expose, and letting this command become a way to reach internal or
scenario-only functions that the network surface refuses.
