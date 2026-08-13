---
'@pikku/cli': patch
'@pikku/ai-vercel': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

Emit `pikkuAIScorer` and `pikkuAIJudge` from the generated agent types so a
project can declare scorers, and read a run's grades from the console.

A tool that threw now reports its reason only on the step record's `error`; the
result replayed to the model stays the generic `Error: Tool execution failed` it
was before scorers needed the reason.
