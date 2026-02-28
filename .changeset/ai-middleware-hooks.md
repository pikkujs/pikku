---
'@pikku/core': patch
---

Add AI middleware hooks for per-tool-call lifecycle and post-step observability:

- `beforeToolCall` / `afterToolCall`: per-tool-call hooks for logging, caching, input sanitization, and result transformation
- `afterStep`: post-step observation hook with full step context (text, toolCalls, toolResults, usage, finishReason)
- `onError`: error-specific hook for alerting and diagnostics (non-throwing, won't affect error flow)
