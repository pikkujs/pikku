---
'@pikku/knowledge': patch
'@pikku/cli': patch
---

Add `pikku knowledge plan` — read and write a milestone's technical plan.

    pikku knowledge plan schema
    pikku knowledge plan show <milestone> [--for-build]
    pikku knowledge plan set <milestone> <file>
    pikku knowledge plan defer <milestone> <item> --reason "..."

`set` is the point of it. It runs the schema, then `checkFirstPass`,
`checkPlanInternals` and `checkAgainstMilestone` against the milestone note's
own surface and personas, and writes nothing unless all of them pass — a plan
validated at gate time instead has already cost the build it was measured
against. A shape refusal carries the schema with it, so a writer told a field
is invalid does not have to go looking for what the valid options are.

`defer` moves ONE first-pass item to the next pass with its reason recorded,
which is the only sanctioned way for something planned to stop blocking the
milestone. The runners live in `@pikku/knowledge` as
`runKnowledgePlanSchema`/`Show`/`Set`/`Defer`, so anything else driving a build
gets the same order of checks without reimplementing it.
