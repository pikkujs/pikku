---
"@pikku/core": patch
"@pikku/cli": patch
"@pikku/inspector": patch
---

Add riskLevel and idempotent to function config, replacing readonly. riskLevel ('read' | 'write' | 'destructive') and idempotent (boolean) are extracted by the inspector, stored in runtime metadata, and emitted as MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint).
