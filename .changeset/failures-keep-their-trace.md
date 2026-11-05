---
'@pikku/core': patch
'@pikku/skills': patch
---

Keep the trace when something fails

A local RPC now runs as a span of its own under its caller. Errors logged by MCP, channels, triggers, agent tools, remote addon calls and inline workflows now carry the trace, and MCP errors and channel error frames return `errorId`, as HTTP does. A job whose data looks like the trace envelope now reaches its worker unchanged.
