---
type: decision
title: pikku virtual-user rpc refuses a function that is not exposed, before it signs in
description: The virtual-user rpc command checks the RPC is exposed before it mints a sign-in statement or signs anyone in
tags: cli, virtual-users, rpc
---

# pikku virtual-user rpc refuses a function that is not exposed, before it signs in

`virtualUserRpc` in `packages/cli/src/functions/commands/virtual-user-rpc.ts` looks the
requested RPC up in `state.rpc.exposedMeta` and throws when it is missing. The
check comes before `resolveStatementMint`, `statementSignIn` and
`createHttpVirtualUsers`, so no signing key is read and no session is opened for a
call that cannot reach a route.

The message depends on the cause. A function that is declared but not exposed is
reported as having no route, and the message says to add `expose: true`. A name
that is not in the exposed set at all gets a "did you mean" list. Both match what
the HTTP surface can reach, the same surface the
[expose selects the RPC surface](../../../core/knowledge/decisions/security/wire-addon-expose-selects-the-rpc-surface.md)
note describes for addons.

**What this rules out:** signing in as a virtual user to call a function that the
app does not expose, and letting this command become a way to reach internal or
scenario-only functions that the network surface refuses.
