---
'@pikku/n8n-import': patch
---

feat(n8n-import): chain nodes coexist with a real Agent node (v2.1)

A LangChain chain node alongside a real Agent node is now promoted to its own
tools-less agent instead of staying a stub. The multi-agent machinery already
attributes each agent's tools by its own `ai_tool` connections, so the chain
(which has none) and the Agent (which keeps its tools) emit as two distinct
agents wired together in the graph — no cross-wiring. Corpus emit+typecheck:
789→797 clean, no new failures.
