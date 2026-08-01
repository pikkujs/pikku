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

Every channel gains `channel.remote(...)`: calling a function on the peer at
the other end of the connection and waiting for its answer. A channel is
otherwise fire-and-forget in both directions, so this is what reaches a peer
that has no address of its own — a CLI on a laptop, a browser tab, a sandbox
behind NAT. It is on `channel` rather than `rpc` because it is bound to one
connection: which peer answers is the socket the call goes out on, not
something the RPC map could resolve. Any `wireChannel` gets it — a client
registers what it is willing to answer to, and a name outside that list is
refused.

Requests are correlated by id, time out, and fail fast when the socket closes
rather than waiting out the timeout. Replies are taken off the socket ahead of
routing, so a channel needs no route for them and an answer can never be
mistaken for a new message; the transport is created on first use and released
when the channel closes, which is also what fails anything the departing peer
still owed an answer to. Channels that only flow one way — SSE, an agent's
output stream, a locally-run CLI — refuse the call outright instead of waiting
for an answer that was never going to come.

What a peer answers with is its word, so it is checked before a caller sees it
— against the schema codegen already generated from the function's declared
return type, the same one an agent tool or an HTTP response is checked against.
A capability is declared as a function like any other, which also means
`channel.remote` is typed off the same generated map as `rpc.remote` and no
caller has to cast. A client on an older build fails the call it answered
rather than the caller failing later somewhere with no reason to expect a bad
shape; a name with no declared contract is left alone. Both frame guards
validate the whole envelope rather than the action tag alone, and a failure
payload with a non-string name or message falls back rather than being attached
to an `Error`.

A channel-driven CLI command uses this to ask its caller for machine-local
facts mid-run — a git sha, a working tree, a local file. The CLI wire's own
channel is synthetic (it exists so a command can stream progress without
knowing where that goes), so it delegates `remote` to the connection the
command actually arrived on.

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
