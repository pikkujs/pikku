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

The arguments going the other way are checked too, against the schema for the
capability's declared input, before anything is registered or sent. That is not
a boundary — the peer runs the code and has to check what it was handed, and a
caller that meant harm would send arguments that pass. It catches drift, where a
server built against a newer capability signature calls a client that predates
it, and fails it here rather than inside someone else's process.

A channel-driven CLI command uses this to ask its caller for machine-local
facts mid-run — a git sha, a working tree, a local file. The CLI wire's own
channel is synthetic (it exists so a command can stream progress without
knowing where that goes), so it delegates `remote` to the connection the
command actually arrived on.

Because that runs code on someone's machine at a remote caller's request, the
capability map says what *can* run and approval says whether a particular call
*should*. A capability may be declared `{ execute, needsApproval }`, sharing
`ApprovalPolicy` — `needsApproval` and `approvalDescriptionFn` — with
`AIAgentToolDef`, which has carried both since before channels could call back:
both are an allowlist of named callables invoked by something other than the
code that wrote them. The runtime around them is deliberately not shared, since
an agent suspends its run and resumes it later while a reverse call is a live
await with a person at the other end.

A capability written as a bare function is unclassified, and unclassified means
approval is required — the annotation nobody got round to writing is the one
most likely to matter, so it fails closed. Declare
`{ execute, needsApproval: false }` for a capability that may run unattended.
Nothing infers this: core cannot tell a read-only capability from a destructive
one, so `needsApproval: false` is the author asserting it, and the assertion is
the only thing standing between a remote caller and the machine.

The default is the opposite of `AIAgentToolDef`'s, where absence means "do not
ask" — a tool is written by the same people who run the server it executes on,
and a capability is not.

`executeRawCLIViaChannel` reads `--auto-approve` and
`--dangerously-auto-approve` out of argv (or `PIKKU_AUTO_APPROVE` /
`PIKKU_DANGEROUSLY_AUTO_APPROVE`) and strips them before argv reaches the
server — what may run on this machine is this machine's decision, and a flag
the server can see is one the server could act on. `--auto-approve` permits the
classified-safe set and refuses the rest; `--dangerously-auto-approve` permits
everything and says so once on stderr. Interactively the user is asked per
call, with `y` / `n` / `a`, where `a` is remembered for that one capability for
the rest of the run and never written to disk — widening it to the session
would quietly turn an interactive run into `--dangerously-auto-approve`. A run
with no terminal and no flag refuses rather than assuming yes, because CI is
exactly where an unattended `git push` would otherwise happen. The tiers are
meaningful here in a way they would not be for an agent: the caller is a
deterministic program whose source can be read, so "these calls are always
fine" is a claim someone can actually justify.

A peer that is asking a human sends a pending frame first, which stops the
caller's timeout. Without it any approval slower than the timeout would fail
the call and then discard the decision when it finally arrived. The call is
still failed the moment the socket drops — what actually happens when a peer
dies mid-prompt — and a peer that sends the frame dishonestly can do nothing
but keep its own call waiting. A refusal is sent as an answer, so a denied call
fails its command immediately rather than hanging.

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
