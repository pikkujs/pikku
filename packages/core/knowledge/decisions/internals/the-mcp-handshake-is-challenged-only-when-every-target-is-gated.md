---
type: decision
title: The MCP handshake is challenged only when every target is gated
description: A client decides whether a server speaks OAuth from the handshake alone, so a fully-gated server that answers initialize with a 200 is detected as needing no sign-in
tags: [mcp, auth, oauth]
---

# The MCP handshake is challenged only when every target is gated

`requestNeedsCredentials` challenges `initialize` when
`mcpEveryTargetRequiresSession()` is true, and only then.

A client decides at connection time whether a server speaks OAuth, and the only
thing it can decide from is whether the handshake came back `401` with a
`WWW-Authenticate` header naming the resource metadata. A server that answers
`initialize` with a `200` and then `401`s every single tool call has told the
client "no sign-in needed" and then refused it everything. That is how a fully
gated server ends up shown as open, with no way for the user to sign in — the
client never offers the option, because it was told there was nothing to offer.

The condition is deliberately all-or-nothing. A server with even one open target
genuinely is usable anonymously, and challenging its handshake would lock out
clients that have no credentials to offer at all. An empty registry is not "all
gated" either: there is nothing there to gate, so the handshake stays open.

**What this rules out:** challenging the handshake whenever _any_ target needs a
session. The handshake is not the place to express per-target policy — the
per-target `401` already does that, and a client that has been let in can act on
it. The handshake only answers "is there a sign-in here at all".
