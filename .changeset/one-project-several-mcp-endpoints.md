---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/node-http-server': patch
'@pikku/bun-server': patch
'@pikku/modelcontextprotocol': patch
---

A project can now serve several MCP endpoints, one per connector.

Until now every MCP tool in a project was pooled onto a single `/mcp`, so a hub offering three connectors offered one endpoint listing all three connectors' tools at once. A client pointed at it saw tools it had no business calling, and the only way to give a connector an endpoint of its own was to give it a deployment of its own — three deploys, three bills, three service graphs.

`wireAddon` gains `mcpEndpoint`. `true` serves that instance's tools at `/mcp/<name>`; a string is the path, used as given. Leaving it unset keeps the tools on the shared endpoint, which is where they have always been, so nothing existing moves.

A surfaced instance now gets its own manifest (`.pikku/mcp/mcp.<name>.gen.json`, carrying the path it answers on), its own deploy unit (`mcp-<name>`, routed on that path), and its own MCP server — with its own tool list, so a client pointed at one endpoint never sees another's tools. The plumbing for the per-surface manifest and unit already existed in `deploy apply`; nothing had ever produced one.

`pikku dev` mounts every endpoint the generated tree describes, not just the default one. Without that a project that moved its tools onto their own endpoints would have served nothing locally at all — the default manifest it reads is empty precisely because they moved — and the only way to try a connector would have been to deploy it.

The node and bun transports take `mcpSurfaces` alongside `mcpJson` and mount each at its own path, longest path first. `/mcp` claims everything beneath `/mcp/`, so without that ordering the default endpoint answers `/mcp/weather` and the surface's tools are unreachable.

OAuth discovery is split between the endpoints rather than duplicated across them. RFC 9728 folds a resource's path into its well-known route, so each endpoint's own document is already distinct, but the path-less `/.well-known/oauth-protected-resource` predates that and describes whichever resource answers it. Only the default endpoint claims it — otherwise every unit registers the same route and the provider's router decides which resource a client is told about, and in dev a client probing it is described whichever surface sorted first.
