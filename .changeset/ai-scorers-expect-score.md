---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `scenario.expectScore` — grade a finished agent run with a declared scorer and assert on it.

An agent's answer cannot be matched against a fixed string, so a scenario grades
it instead. `expectScore(step, runId, scorer, { atLeast, atMost, reference })`
runs one declared scorer against the run the scenario just triggered and fails
with the reason the judge gave. The default bound is `atLeast: 0.5`, so an
unqualified assertion still fails a run graded zero.

Grading goes over the new `pikkuScenarioGradeRun` instrumentation RPC, which the
dev server registers alongside the coverage and stub RPCs — so it exists only in
processes that should have it, and never in a deployed bundle. It grades from
the snapshot the runtime already took when the run finished, which is what makes
a scenario's grade the same measurement production's sampler makes rather than
an approximation of it: a run's prompt, answer and tool calls are spread across
a thread's messages, where the boundary of one run is not recoverable.

Two things differ deliberately from live scoring. The sample rate is ignored — a
scorer grading 1% of traffic still grades every scenario run — and the grade is
returned rather than recorded, so a test's score never lands among the
production figures. `reference` supplies the answer key a `requiresReference`
judge grades against, which is the only way such a judge is reachable at all.
