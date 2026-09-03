---
'@pikku/knowledge': patch
---

Let the caller own the plan's closing instruction, and export `basePlan`.

`renderPlanForBuild` ended every plan with "then run `fabric build-complete`" — one
product's CLI command in the mouth of every reader of a plan. It now takes an optional
`closing` the driving harness supplies, and says nothing of its own. The comments naming
`fabric verify` and `fabric build-complete` describe the same contract generically: a
mid-build check and a closing gate.

`basePlan` — one plan that passes every check, for tests to vary from — was built and
shipped but never exported, so no consumer could reach it.
