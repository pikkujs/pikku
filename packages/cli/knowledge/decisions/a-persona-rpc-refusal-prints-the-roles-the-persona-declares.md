---
type: decision
title: A 401 or 403 from pikku persona rpc prints the persona's declared roles and exits 1
description: The command reports a refused call with the roles the persona declares in code, not the roles the server holds, and returns instead of throwing
tags: cli, personas, rpc, roles
---

# A 401 or 403 from pikku persona rpc prints the persona's declared roles and exits 1

After the call, `personaRpc` in `packages/cli/src/functions/commands/persona-rpc.ts` checks for a
status of 401 or 403 (line 107). It sets `process.exitCode = 1` (line 108) and writes
`'<persona>' (<roles>) is not permitted to call '<rpc>': <status>` followed by the serialized
response (lines 109-111), then returns (line 112). With no declared roles it prints `no roles` (line 110).

The roles come from `persona.roles` (line 110). `persona` is the entry in the result of
`resolvePersonas` over the inspector's `personas.definitions` (lines 38-42, 43), so they are the roles
the code declares, not what the server stored for the signed-in user.

Other failures take a different path. A server that cannot be reached, or a sign-in that throws,
becomes a `PikkuError` (lines 92-99). A 404 or an "RPC function not found" body becomes a `PikkuError`
saying the dev server is stale (lines 102-106). Any other non-ok status sets the exit code and prints
the body (lines 114-117).

**What this rules out:** reading the printed roles as proof of what the server granted, and treating a
401 or 403 as a command failure that throws: the refusal is an expected answer and is printed.
