---
'@pikku/cli': patch
---

Agent, MCP and channel deployment units now take `deploy.defaultTarget` instead of always being serverless, and a server-target one is folded into the merged server container with its agent, MCP and channel wirings. A project that defaults to `server` no longer gets worker bundles for them that cannot hold its node-only services.
