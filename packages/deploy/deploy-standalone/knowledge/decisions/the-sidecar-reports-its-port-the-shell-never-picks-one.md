---
type: decision
title: The sidecar reports its port; the shell never picks one
description: The server binds :0 and prints the port it got on the ready line; Rust blocks on that line rather than choosing a free port and passing it down
tags: [tauri, desktop, ports, server-ready]
---

# The sidecar reports its port; the shell never picks one

The shell starts the sidecar with `PORT=0`, reads its stdout until the ready
line appears, parses the port out of it, and only then creates the window.

The obvious alternative — have Rust find a free port and pass it down — has a
race with no fix: between the check that a port is free and the sidecar's bind,
anything on the machine can take it. Binding first and reporting back is the
only ordering with no window in it.

The line it waits for is the existing readiness marker:

```
pikku: ready on http://127.0.0.1:53422
```

`SERVER_READY_MARKER` now lives in `@pikku/deploy` rather than in the CLI,
because the two ends of the handshake are built by different packages: the CLI
waits on it for `pikku dev --spawn`, and the standalone provider's generated
entry prints it from inside the shipped binary. The CLI re-exports it from its
old path, so nothing that imported it had to change. A second copy of the string
would have drifted the first time either side touched it.

Making the line true required a real bound port to report. `--port 0` used to
print `:0`, because both `serve` and `dev` logged the *requested* port. Both
runtimes now expose the port they actually bound —
`PikkuNodeHTTPServer.port` reads `server.address()`, `PikkuBunServer.port`
already had it — `DevServerInstance` carries it, and every URL announced after
`start()` is built from it.

Note that `listening on …` is still **not** readiness. It is printed inside
`server.start()`, before the project's `afterStart` has run, so a parent that
treats it as ready races whatever the project seeds there.

**What this rules out:** a fixed default port for desktop builds, port
allocation in Rust, a handshake over a file or a socket instead of stdout, and
treating the runtime's own `listening on …` line as ready.
