---
type: decision
title: A standalone artifact's command line has no way to invoke an RPC
description: The bundle answers serve, version, help, db migrate, db status and backup, and an in-process RPC invoke is left out because it would skip auth, sessions and middleware
tags: deploy, standalone, cli, rpc, auth
---

# A standalone artifact's command line has no way to invoke an RPC

`packages/deploy/deploy-standalone/src/runtime/cli.ts` defines the commands a shipped artifact answers.
`StandaloneCommand` has four kinds: `serve`, `db` (`migrate` or `status`), `backup` and `exit`
(lines 63-67). `serve` is the default when no command is given (line 106). Any other word is an
unknown command that prints usage and exits 1 (lines 158-161).

The header comment states the omission (lines 15-18). A running server already answers RPCs over its
own wire with auth, sessions and middleware applied. An in-process invoke would answer them with none
of that, which on a production box is "a way to run any function as nobody".

The set is described as deliberately small, and every non-serve command exits instead of opening a
port (lines 11-13). The commands that do exist act on the database the build opens: `db migrate` and
`db status` (lines 126-137, 235-267), and `backup` for SQLite only (lines 139-156, 276-290).

**What this rules out:** adding a `call` or `rpc` command to the bundle that dispatches into the function
runner in the same process, and any operator workflow that runs app functions without going through the
server's wire.
