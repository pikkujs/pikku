---
type: decision
title: An MCP refusal is decided before dispatch, not raised from the tool
description: mcpTargetRequiresSession lets the transport answer 401 with an OAuth challenge, because the MCP response streams and the status is gone by the time the runner refuses
tags: mcp, permissions, transport
---

# An MCP refusal is decided before dispatch, not raised from the tool

An MCP client discovers how to authenticate from a `401` carrying a
`WWW-Authenticate` challenge — that header names the RFC 9728 Protected Resource
Metadata document, which names the authorization server, which is where OAuth
starts. Delivered any other way, the refusal is not a refusal: a `MissingSessionError`
flattened into a JSON-RPC result arrives as `200` with `isError: true`, which a
client reads as a tool that failed, and no discovery happens.

The obvious implementation — catch the refusal in `tools/call` and set the status
afterwards — cannot work, and not for a reason a test makes obvious. The MCP HTTP
response **streams**: the entry returns a `Response` whose body the transport is
still writing when the JSON-RPC handler runs. Instrumenting both ends shows the
entry observing its own flag as unset *before* the tool ever refuses. Status and
headers are chosen at the top of the response; by the time anything knows a
session was missing, they are already on the wire.

So the decision moves earlier, to the only two things knowable before dispatch:
which target the request body names, and whether the request presents anything to
authenticate with. `mcpTargetRequiresSession` answers the first from the same
declarations the runner enforces — a `pikkuFunc` always needs a session, a
`pikkuSessionlessFunc` needs one only where it says `auth: true` — so the
transport's answer and the runner's cannot disagree. An unregistered name is
treated as open, because a name nobody registered is a `Method not found`, and
challenging it invites a client to authenticate its way towards a tool that does
not exist.

This is what makes a single endpoint serve public and private tools together,
which the MCP spec allows and pikku's per-function `auth` flag already describes.
`tools/list` stays ungated, so a client can see the menu before it has a token.

**What this rules out:** verifying tokens in the transport. Only a request with
*no* credentials is challenged; a present-but-expired token is dispatched and its
refusal reaches the client as a tool error. Doing better means resolving the
session before dispatch, which runs the app's middleware twice per call and puts
the transport in the business of second-guessing the middleware that owns session
resolution. The cheaper half — no credentials at all — covers the case that
actually matters, because that is the state every client starts in.

Also ruled out: gating the endpoint as a whole with `requireBearerAuth`. It would
work, and it would make every public tool private, which is a different product.
