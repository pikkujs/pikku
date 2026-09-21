---
'@pikku/modelcontextprotocol': patch
---

An MCP endpoint now serves only the tools, resources and prompts its own manifest names.

A project serving several connectors registers every connector's surfaces in one process, and dispatch resolved them out of that process-wide registry rather than out of the endpoint's manifest. `tools/list` was already scoped, so a connector's tools were hidden from the other endpoints — but `tools/call` ran them anyway for any caller who knew a name. An endpoint reachable by one client could invoke a different connector's tools, which is exactly the boundary serving them separately is meant to draw.

Resources and prompts were looser still: `resources/list` and `prompts/list` read the process-wide meta directly, so an endpoint advertised every connector's resources and prompts and then served them. Only `resources/templates/list` was scoped.

All six surfaces now agree on the endpoint's own manifest. `tools/call`, `resources/read` and `prompts/get` answer `-32602` when the target is not theirs, and the two listings are filtered to match. Resource membership is matched on uri, since that is what resources are listed and read by, while their descriptive fields still come from the meta — the manifest carries no title or mimeType. Nothing changes for a single-endpoint project, where the manifest already names everything it can reach.
