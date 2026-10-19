---
'@pikku/modelcontextprotocol': patch
---

An MCP server whose every tool, resource and prompt needs a session now challenges `tools/list`, `resources/list` and `prompts/list` without credentials, as it already did `initialize`. Before, the list of names was readable by anyone.
