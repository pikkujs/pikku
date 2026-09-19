---
'@pikku/modelcontextprotocol': patch
'@pikku/core': patch
'@pikku/cli': patch
---

MCP clients can now discover that a server needs signing in to, and can see tools whose names carry a namespace.

Three separate reasons a client ended up connected to a server it could do nothing with:

- **The handshake was never challenged.** A client decides at connection time whether a server speaks OAuth, and all it has to go on is whether `initialize` came back `401` with a `WWW-Authenticate` challenge. Answering it `200` and then refusing every subsequent call told the client "no sign-in needed" and then gave it nothing — Claude's connector setup, for one, reported the server as open access. `initialize` is now challenged when `mcpEveryTargetRequiresSession()` holds, which is the only case where answering it openly is a lie; a server with even one open target still completes the handshake unauthenticated, as it should.
- **Namespaced names were dropped on the floor.** MCP constrains tool and prompt names to `[A-Za-z0-9_-]{1,64}`, and pikku's namespace separator is `:`. Clients discard the names they cannot accept rather than failing the connection, so an addon's entire surface went missing with nothing more than a note about "tools with unsupported names". Names are now rewritten at the transport boundary (`mcpWireName`) and resolved back on the way in (`mcpResolveWireName`), so `bb2:getMe` is offered as `bb2_getMe` and calls to it dispatch correctly. The registry keeps its own spelling, since that is what dispatch keys on, and a tool genuinely registered under the wire spelling still wins over a rewritten match.
- **An addon-only app generated no tool metadata.** `pikku all` decided whether to emit the MCP file from the set of source files calling `wireMCPTool`/`Resource`/`Prompt`. An addon that contributes its tools through `wireAddon({ mcp: [...] })` adds none, so an application whose only MCP surface came from addons got neither wirings nor meta — the tools were listed from `mcp.gen.json` and then every call failed to resolve, because `toolsMeta` (which carries the `pikkuFuncId`) had never been written. Content now decides; the file set only decides whether there are imports to serialize.

Also in here: the resource URL advertised in the challenge honours `X-Forwarded-Proto` and `X-Forwarded-Host`, so a server behind a TLS-terminating proxy advertises the `https://` URL the client actually reached rather than its own internal `http://` origin — which the client would reject as a resource mismatch.
