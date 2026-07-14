---
'@pikku/n8n-import': patch
---

feat(n8n-import): map LangChain chain nodes to tools-less agents

A lone n8n LangChain *chain* node (chainLlm, informationExtractor,
textClassifier, chainSummarization, sentimentAnalysis) with no Agent node is now
promoted to a tools-less `pikkuAIAgent` instead of a throwing stub: goal from the
node's prompt, model from the connected chat-model sub-node, and a structured
`output` Zod schema where the type defines one (informationExtractor's
`inputSchema`, textClassifier's `categories` → `z.enum`). `chainRetrievalQa` is
left a stub (needs a vector store, #902); multiple chains, or a chain alongside a
real Agent, also stay stubs (the graph wires one agent per workflow — a v2
concern). Also hardens `mapModel` to reject a runtime-chosen (expression) model
id and emit the model string safely. Corpus emit+typecheck: 726→766 clean, and
the model fix drops a pre-existing tsc-error (4→3).
