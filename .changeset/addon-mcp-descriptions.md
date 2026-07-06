---
'@pikku/openapi-parser': patch
---

Always emit a description for generated addon functions (and their MCP tools). When an OpenAPI operation omits both `description` and `summary` (common), the generator now synthesizes one — a humanized `operationId` (with the `Controller` segment stripped), else `METHOD /path` — instead of emitting none. This removes the "MCP tool is missing a description" warnings and makes `--mcp`-exposed tools usable.
