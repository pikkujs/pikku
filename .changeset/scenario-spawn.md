---
'@pikku/cli': patch
---

`pikku scenario run --spawn` starts the server for the run, and the server now says when it is ready.

Running scenarios meant having a server on the environment's `apiUrl` already, so every project had to write its own spawn-wait-kill script. `--spawn` starts `pikku dev` on that URL, waits for it, runs, and kills the process group afterwards; `--keep-alive` leaves it up for a dev loop. Without `--spawn` nothing changes — the environment must already be serving.

```bash
pikku scenario run local --spawn --no-browser
```

The waiting half needed a signal that did not exist. Both `dev` and `serve` do:

```ts
await pikkuServer.start() // logs `listening on …`
await lifecycle?.afterStart?.(services)
```

so the `listening on …` line is printed while the project's `afterStart` is still running — anything seeded there (users, roles, fixtures) is still pending when a parent process sees it. Both commands now log **`pikku: ready on http://host:port`** once `afterStart` resolves, and that is what `--spawn` waits for. Projects that were polling an application endpoint to guess at this can stop: readiness is no longer something each app has to define.

A run refuses to start if something is already listening on the target port. A readiness check cannot tell your server from someone else's — both answer on the same address — so a stale server would otherwise silently absorb the run and report failures belonging to code nobody is looking at.

`@pikku/cli` gains two subpath exports, `./server/spawn-dev-server` and `./server/server-ready`, for test runners that need to do this themselves rather than through `scenario run`.
