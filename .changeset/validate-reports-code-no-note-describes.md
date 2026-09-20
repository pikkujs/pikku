---
'@pikku/knowledge': patch
'@pikku/cli': patch
---

`knowledge validate` now reports code that no note describes.

The resource check ran one way. It asked whether every `resource:` a note points at still resolves, which catches a note rotting into fiction after a rename — but it could not answer the inverse, and the inverse is the question somebody asks before deciding what to build next: what is already here that nobody wrote down. Every check in `validate.ts` started from a note and walked outward, so a project could pass clean while half its functions had never been recorded.

Both directions are the same join, so the orphan report is a set difference over data the check already loads: the ids codegen meta offers, minus the ids any note claims in `resource:` or in a prose link. It is reported for `func`, `table` and `workflow` — a wire is a way to reach a function already reported, and a schema, scope, addon or persona is machinery rather than something a note would be about. `orphanPrefixes` changes the set and an empty array turns the report off.

An orphan is `info` and stays outside `ok`: a project is allowed to have more code than record, and on an imported repository that is the normal state rather than a fault. `baseline` subtracts ids no note will ever cover — a template's own auth and health functions — from the report without making them dangle. The CLI collapses orphans into one summary of at most ten, because an imported project reports every function it has and printing those in full buries the findings somebody can act on.
