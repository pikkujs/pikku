---
'@pikku/core': patch
---

**Breaking:** `ScenarioRpcResponse` is now `ScenarioHttpResponse`. Nothing about the shape (status, ok, body) was ever RPC-specific — it is an HTTP response with its body already drained — and it gains `serialized`, the body as text. `readScenarioHttpResponse(res)` is exported so a step that has to reach past `invokeRaw` for a non-RPC route drains the response the same way instead of inventing its own record — and `invoke`'s refusal error now quotes the raw text, so an HTML or plain-text error body says what went wrong instead of `"undefined"`.
