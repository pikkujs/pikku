---
'@pikku/knowledge': patch
---

Add the milestone plan format to `@pikku/knowledge`.

A milestone says what to build; a plan says what building it consists of —
which functions, wires, roles, scopes, screens and scenarios a pass owes, and
what was deferred to the next one. The two halves were split across two repos:
this package owned the note format, `MILESTONE_TYPE` and `runKnowledgeValidate`,
while the plan lived downstream. Anything that wanted to write a plan had to
reimplement the schema from an example.

`PlanSchema` and `PLAN_VERSION` are the format. `readPlan`/`writePlan` are the
only readers and writers. `checkFirstPass`, `checkAgainstMilestone` and
`checkPlanInternals` are deterministic gates over a plan and its milestone —
they judge whether the plan holds, never whether it is a good plan, which stays
a matter for whatever wrote it. `planSchemaJson` emits the schema as JSON Schema
so an agent can be handed the shape rather than made to infer it.

`plan-meta` reads a generated `.pikku` meta directory and reports which planned
items the code actually discharges: `planProgress`, `planShortfall`,
`cascadeProblems`. `hollow-scenarios` classifies a scenario by what it proves,
so a plan cannot be satisfied by scenarios that assert nothing.

`readPlan` refuses a plan whose `version` this reader does not know, naming the
version, rather than reporting the mismatch as a scatter of field errors. That
is what lets the format change later without a stale reader spending its turn
editing fields to satisfy a schema it cannot satisfy.

`notes` also gains `MILESTONES_DIR`, `MILESTONE_SURFACES`, `listOf` and
`noteHash`, which the plan reads and which belong with the note vocabulary.
