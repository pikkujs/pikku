---
type: decision
title: pikku dev runs each selected backend as its own process
description: with two or more backends selected, pikku dev runs codegen once and watches, and each backend is a child serving .pikku/backends/<name> on its dev.port with no codegen of its own
tags: cli, dev, backends, codegen
---

# pikku dev runs each selected backend as its own process

`planDev` (`src/functions/commands/dev-backends.ts`) decides how one `pikku dev`
is carried out from the backends selected (`--backend <name>` narrows, else every
declared one):

- **One backend selected: inline.** This process is the server, as before. With
  `--backend <name>` it serves that backend's filtered tree
  (`.pikku/backends/<name>`) under the backend's filter, on `--port`, else the
  backend's `dev.port`; codegen is `pikku all --backend <name>`. With the lone
  backend unnamed it serves the shared `.pikku` (unfiltered), unchanged.
- **Two or more: parent.** The parent runs `pikku all` once (the shared pass, then
  one pass per backend), owns the watcher, the frontends, `.env` secrets and the
  dev address, and starts one child per backend:
  `pikku dev --backend <n> --port <dev.port> --serveOnly --no-watch --no-frontends`
  plus the user's `--coverage`, `--test`, `--model`, `--no-hmr`. `--port` is
  refused here; each backend has its own `dev.port` (the loader already requires it).
- **A child never runs codegen.** `--serveOnly` loads the backend tree, inspects
  the project itself under the backend filter, and reloads (meta, schemas,
  re-imported wirings, addon registry) when the parent sends `SIGUSR2` after a
  codegen pass. The parent's own `SIGUSR2` is the watcher wake-up; the two never
  share a process.
- Output is prefixed `[name]`; the parent waits for every ready line; if any child
  exits the parent stops the rest and exits non-zero. `stop` is SIGTERM, then
  SIGKILL after five seconds.
- Frontends proxy to the first declared backend (`VITE_API_PROXY`, which the
  environment can still override). Choosing a backend per frontend is later work.
- `pikku scenario run --spawn` passes `--backend` when several are declared.

## Rejected

- Serving every backend from one process: a backend's filtered tree is a
  separate registration set, and one process cannot hold two.
- Each child watching and running codegen: they would race on the shared `.pikku`.
