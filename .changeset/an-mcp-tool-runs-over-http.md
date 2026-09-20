---
'@pikku/modelcontextprotocol': patch
---

Cover an MCP tool actually running over the HTTP endpoint

Every existing test stopped at the mount: a GET without an `accept` header
returning 406 proved the handler was routed to, and nothing beyond that. A
tool had never been invoked over the transport in a test, so the path from a
JSON-RPC `tools/call` to a wired pikku function and back was unverified.

This drives a real session against a listening socket — `initialize`,
`tools/list`, `tools/call` — and asserts the function ran with the arguments
the client sent and that its return value came back through the transport.
