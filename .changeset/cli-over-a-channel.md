---
'@pikku/core': minor
'@pikku/cli': minor
'@pikku/ws': patch
'@pikku/inspector': patch
---

Run a CLI's commands on the server, over the connection the client opened

A CLI that talks to a service has to ship the service's command tree, so the
two versions drift: the binary someone installed months ago still believes in
flags and commands the server has since changed. This makes the command tree
the server's, and leaves the client holding only a socket.

`wireCLI` gains `auth`, and a program wired with a channel entrypoint now
generates a `__raw` route: the client forwards argv untouched, the server
parses it, runs the command, and streams the output back as it happens. The
terminating frame carries the exit code, so a failed remote command still exits
non-zero locally. Renderers stay on the client and are matched by the command
id the server reports; an unrecognised command falls back to JSON rather than
failing.

Commands can also call _back_ into the client mid-run. `rpc.remote(...)` inside
a channel-driven command resolves over the same open socket, against an
allowlist the client passes in — the machine-local facts a server cannot see (a
git sha, a working tree, a local file) without the client needing an address of
its own. This is a new `ChannelDeploymentService` filling the existing
`deploymentService` seam, so the RPC runner itself is unchanged; requests are
correlated by id, time out, and fail fast when the socket closes rather than
waiting out the timeout.

Fixes found on the way, each of which broke this path:

- A websocket upgrade wrote middleware headers (CORS, on every request)
  straight onto the socket, so the first bytes a client saw were headers rather
  than `ws`'s `101` status line and the handshake failed to parse. Header
  writes are now buffered and flushed behind a status line only when the
  upgrade is actually being rejected.
- An upgrade socket had no error listener while the channel opened, so a client
  that gave up mid-handshake took the whole server process down with an
  unhandled `ECONNRESET`.
- `onConnect` and `onDisconnect` never saw the session established during the
  upgrade, so a channel could not tell who had just connected.
- Setting the routing key on a channel result mutated the value in place, which
  throws for a primitive under ESM strict mode.
