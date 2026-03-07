---
'@pikku/core': patch
'@pikku/ai-vercel': patch
---

Fix agent sub-agent tool execution failures: use UUID for sub-agent thread IDs (was exceeding varchar(36) DB column), and synthesize error results for failed tool calls in non-streaming run() to prevent "Tool result is missing" cascading errors.
