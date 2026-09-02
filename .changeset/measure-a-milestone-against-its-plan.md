---
'@pikku/knowledge': patch
'@pikku/skills': patch
'@pikku/cli': patch
---

Measure a finished milestone against its plan, with `pikku knowledge plan progress`.

The reconciliation itself already existed — `planShortfall` reads pikku's generated meta under `.pikku/` and answers "was this planned function written, this route wired, this `pikkuScenario` exported" by set membership. Nothing in the CLI could run it, so the only thing closing a milestone was the build agent's own account of what it had done.

`pikku knowledge plan progress <milestone>` prints what the milestone still owes, separating what BLOCKS (the first pass) from what a later pass picks up, and exits non-zero while anything blocks. Its problems include the two checks no meta covers: a browser scenario that opens a page and asserts it is still on it, and an `on delete cascade` the plan promised that no migration declares.

Two skills follow it. The new `pikku-architect` writes the plan against the milestone note through `pikku knowledge plan set`, as a seat separate from the build — a builder who writes its own plan can build a fraction, plan only that fraction, and certify itself complete. `pikku-build` now plans each milestone before building it (§5a) and closes it on `plan progress` rather than on memory (§6a), with `pikku knowledge plan defer` as the only way an unbuilt item leaves the first pass.

Two things `plan set` needed before an architect could actually satisfy it: it now refuses a `covers` entry naming a note that does not exist, or carrying a hash that is not that note's current one — and names the correct hash, which is also the only way to obtain one. Unchecked, a placeholder hash was accepted and the note it claimed read as edited-since from the moment the milestone shipped, dropping silently back into a backlog nobody had planned. The plan's build rendering no longer names a runtime-specific command for creating a frontend, since two builds read it and each creates one a different way.
