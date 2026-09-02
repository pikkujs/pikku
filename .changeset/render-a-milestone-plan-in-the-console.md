---
'@pikku/addon-console': patch
'@pikku/console': patch
---

Render a milestone's plan in the console, beside the note that asked for it.

`console:getKnowledge` now carries a plan per milestone note: the plan read from
`<note>.plan.json`, and the checklist `planShortfall` produces by reconciling it
against the generated meta. Both come from one read, so the checklist can never
disagree with the plan it is drawn beside, and a milestone nobody planned keeps
its key and says why rather than going missing from the bundle.

`PlanDocument` draws it — the covers, the model, the functions with their wires
and permission rules, the screens, the roles, the scopes and the three levels of
scenario, as sections a reader opens one at a time, above a checklist ticked from
what codegen emitted rather than from anything a build reported.

It is presentational: the plan and its checklist arrive as props. Fabric reaches
a sandbox over its own transport and has been drawing these from its own copy of
the renderer, so the component and the pure model behind it
(`slotItems`, `planChecklistProgress`, `planCoverage`) are exported, along with
the `SectionsCard`/`SectionHeader` pair the document is built from.
