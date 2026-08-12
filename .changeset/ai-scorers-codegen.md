---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Wire `pikkuAIScorer` / `pikkuAIJudge` through the inspector and codegen, and let an agent name the scorers that grade it.

The inspector reads a scorer's lane off which constructor was called rather than
off a field, so the two lanes cannot disagree with the code that produced them,
and refuses a scorer with no name or description — the meta is the only thing
that names it at runtime. An agent naming a scorer that was never declared is a
build error (`PKU155`) rather than an agent that quietly grades nothing forever.

Codegen emits a `ScorerName` union, so `scorers` on an agent is checked against
the scorers the project actually declares, plus the scorer wirings and meta.
`pikku validate` now also flags a scorer declared outside a `*.scorer.ts` file,
for the same reason scenarios have to live in files named for them: a rubric
buried in an agent definition is one nobody reviews as a rubric.
