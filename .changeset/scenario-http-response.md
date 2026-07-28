---
'@pikku/core': patch
---

`ScenarioHttpResponse` is what an actor's transport answers with.

Nothing about the shape (status, ok, body) is RPC-specific — it is an HTTP response with its body already drained — so it is not named for RPC, and it carries `serialized`, the body as text. `readScenarioHttpResponse(res)` is exported so a step that has to reach past `invokeRaw` for a non-RPC route drains the response the same way instead of inventing its own record, and `invoke`'s refusal error quotes the raw text, so an HTML or plain-text error body says what went wrong instead of `"undefined"`.

Both are generic in the body — `readScenarioHttpResponse<{ runId?: string }>(res)` — defaulting to `unknown`. A body that will not parse as JSON is carried as its raw text rather than dropped.

The whole scenario-actor surface is new and unreleased, so there is nothing here to migrate from.
