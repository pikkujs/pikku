---
type: decision
title: scaffold console fails codegen unless the project declares pikkuBetterAuth
description: The console functions generator throws when scaffold.console is on and no pikkuBetterAuth config is found, because every console RPC requires a session
tags: cli, console, codegen, auth
---

# scaffold console fails codegen unless the project declares pikkuBetterAuth

`pikkuConsoleFunctions` in `packages/cli/src/functions/wirings/console/pikku-command-console-functions.ts` returns early during
deploy codegen (`pikku-command-console-functions.ts:13-15`).

When `scaffold.console` and `consoleSchemasFile` are both set, it checks for a `pikkuBetterAuth(...)` declaration
(`pikku-command-console-functions.ts:17-26`). The comment says every console RPC requires an authenticated session and that a
console scaffolded without an auth strategy would 403 on every call, so it fails fast (`pikku-command-console-functions.ts:18-21`).
If none is found it throws (`pikku-command-console-functions.ts:27-30`).

**What this rules out:** generating a console for a project with no auth strategy.
