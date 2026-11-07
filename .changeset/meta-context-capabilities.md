---
'@pikku/cli': patch
---

`pikku meta context --json` now reports `agent: true` for apps with agents and `mcp: true` for apps with MCP tools, resources or prompts; both were always `false`.
