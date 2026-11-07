---
type: decision
title: pikku dev binds the port in the local environment's apiUrl
description: without --port, pikku dev listens on the port of the local environment's apiUrl (scheme default when it names none), else 3000; an explicit --port still wins
tags: cli, dev, environments, port
---

# pikku dev binds the port in the local environment's apiUrl

`pikku dev` resolves its port with `resolveDevPort`
(`packages/cli/src/functions/commands/environment.ts`):

1. `--port`, when given (0 still asks the OS for a free port; anything that is
   not 0-65535 is refused).
2. Otherwise the `apiUrl` of the environment `resolveDevEnvironmentName` picks —
   a non-production environment on a loopback host, `local` preferred. A URL
   with no port means its scheme default (80, or 443), the same reading
   `pikku scenario run --spawn` uses through `apiUrlPort`.
3. Otherwise 3000.

The `--port` option therefore has no wiring default; a default would make an
explicit `--port 3000` indistinguishable from no flag.

**Why:** `environments.local.apiUrl` is what scenarios, virtual users and the
`pikku dev` address file are checked against. With a fixed 3000 default, a
project that moved its API (because another project held 3000) had to repeat
the port as `--port` in its dev script, and forgetting it produced a server the
scenarios could not reach with no error saying why.

**What this rules out:** a dev script carrying `--port`, and a second place
that states the local API's port.
