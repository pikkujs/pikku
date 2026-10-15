---
type: decision
title: A 401 or 403 from pikku virtual-user rpc prints the virtual user's declared roles and exits 1
description: The command reports a refused call with the roles the virtual user declares in code, not the roles the server holds, and returns instead of throwing
tags: cli, virtual-users, rpc, roles
---

# A 401 or 403 from pikku virtual-user rpc prints the virtual user's declared roles and exits 1

After the call, `virtualUserRpc` in `packages/cli/src/functions/commands/virtual-user-rpc.ts`
checks for a status of 401 or 403. It sets `process.exitCode = 1`, writes
`'<virtual user>' (<roles>) is not permitted to call '<rpc>': <status>` followed by the
serialized response, then returns. With no declared roles it prints `no roles`.

The roles come from `virtualUser.roles`. `virtualUser` is the entry in the result of
`resolveVirtualUsers` over the inspector's `virtualUsers.definitions`, so they are the roles
the code declares, not what the server stored for the signed-in user.

Other failures take a different path. A server that cannot be reached, or a sign-in that throws,
becomes a `PikkuError`. A 404 or an "RPC function not found" body becomes a `PikkuError` saying
the dev server is stale. Any other non-ok status sets the exit code and prints the body.

**What this rules out:** reading the printed roles as proof of what the server granted, and treating a
401 or 403 as a command failure that throws: the refusal is an expected answer and is printed.
