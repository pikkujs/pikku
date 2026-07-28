---
'@pikku/core': patch
---

Name the actor transport's answer for what it is: `ScenarioHttpResponse` (status, ok, body — plus `serialized`, the body as text). Nothing about the shape was ever RPC-specific, so `ScenarioRpcResponse` stays as a deprecated alias. `readScenarioHttpResponse(res)` is exported so a step that has to reach past `invokeRaw` for a non-RPC route drains the response the same way instead of inventing its own record — and `invoke`'s refusal error now quotes the raw text, so an HTML or plain-text error body says what went wrong instead of `"undefined"`.
