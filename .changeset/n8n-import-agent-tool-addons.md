---
'@pikku/n8n-import': patch
---

Wire agent-tool integration nodes to their per-service addon rpc. An `ai_tool`
node whose service + resource + operation resolves through the integration map
(e.g. `gmailTool` → `gmail:messageSend`, `googleCalendarTool` →
`google-calendar:eventsInsert`) now refs that addon rpc directly in the agent's
`tools: [...]` — the addon function's own schema and description drive the LLM
tool — instead of emitting a throwing stub. The addon package is added to the
generated `wireAddon` set. Tools with no addon target (`mcpClientTool`,
`executeCommandTool`, custom tools) still emit a stub. This lights up the large
set of `*Tool` integration-map entries that were previously unused by the
importer's agent-tool path.
