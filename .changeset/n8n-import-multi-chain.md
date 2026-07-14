---
'@pikku/n8n-import': patch
---

feat(n8n-import): support multiple chain nodes per workflow (multi-agent)

A multi-chain pipeline (several LangChain chain nodes wired in sequence) now
imports as a graph of N distinct tools-less agents instead of leaving all but
one as stubs. Each agent gets a unique const, AgentMap key, and `.agent.ts`
file namespaced by node id (`<slug>_<nodeId>Agent`); the graph references each
by its own const. The single-agent case is unchanged (`<slug>Agent`). Agent
tools are attributed per-agent via their `ai_tool` connection. A chain
alongside a *real* Agent node still stays a stub (mixed-agent tool attribution
is a follow-up). Corpus emit+typecheck: 766→789 clean, no new failures.
