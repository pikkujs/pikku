---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

Add runtime scoring for AI agents: `pikkuAIScorer` for heuristic grades and
`pikkuAIJudge` for LLM-judged ones, graded off the request path on two queue
lanes so a slow judge cannot starve the cheap checks. Grades are sampled
deterministically per `(run, scorer)` and persisted to `ai_run_score`.
