---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

`pikkuAIAgent` gains a `workflows: []` capability: a referenced workflow is exposed to the LLM as a tool that runs inline and returns its output.
