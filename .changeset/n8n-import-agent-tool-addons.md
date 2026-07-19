---
'@pikku/n8n-import': patch
---

The n8n importer now wires `ai_tool` integration nodes to their per-service addon RPC (e.g. `gmailTool` → `gmail:messageSend`) in the agent's `tools`, instead of emitting a throwing stub.
