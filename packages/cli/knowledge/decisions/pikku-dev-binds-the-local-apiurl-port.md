---
type: decision
title: pikku dev binds the port of the local backend
description: without --port, pikku dev listens on the port of the local environment's first backend url (backends.<name>.dev.port when it names none), else 3000; an explicit --port still wins
tags: cli, dev, environments, port
---

# pikku dev binds the port of the local backend

`pikku dev` resolves its port with `resolveDevPort`
(`packages/cli/src/functions/commands/environment.ts`):

1. `--port`, when given (0 still asks the OS for a free port; anything that is
   not 0-65535 is refused).
2. Otherwise the url of the first backend of the environment `resolveDevEnvironmentName` picks —
   a non-production environment whose backends are all on a loopback host, `local` preferred. A local backend with no `url` takes `http://localhost:<backends.<name>.dev.port>`, so the port is declared once. A URL
   with no port means its scheme default (80, or 443), the same reading
   `pikku scenario run --spawn` uses through `apiUrlPort`.
3. Otherwise 3000.

The `--port` option therefore has no wiring default; a default would make an
explicit `--port 3000` indistinguishable from no flag.

**Why:** the local backend url is what scenarios, virtual users and the
`pikku dev` address file are checked against. With a fixed 3000 default, a
project that moved its API (because another project held 3000) had to repeat
the port as `--port` in its dev script, and forgetting it produced a server the
scenarios could not reach with no error saying why.

**What this rules out:** a dev script carrying `--port`, and a second place
that states the local API's port.
