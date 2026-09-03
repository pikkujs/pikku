---
'@pikku/knowledge': patch
---

`knowledge validate` now checks plans, not just notes.

The deterministic machinery already existed — `planShortfall` reads what the plan promised
against pikku's generated meta — but nothing called it from `validate`, so the two halves
had never been introduced. Each milestone's plan is now parsed, checked for the problems
decidable from the plan alone, and, once the milestone is `built` and codegen has run,
reconciled against the code.

That reconcile reports three outcomes rather than two: an item that landed, one deferred to
a later pass and recorded as such, and one that is neither — a promise that left the world
silently. The third is the finding nothing else surfaced.

Two deliberate silences. A milestone with no plan is only reported on a project that plans
at all, since plans are optional here. And with no codegen output the verdict is "cannot
say" rather than "none of it was built", so validating a knowledge base before there is any
code stays clean.
