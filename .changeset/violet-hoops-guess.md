---
'@pikku/knowledge': patch
---

Add the dispatch gate and the reconcile loop, with a seam for a profile's own gates.

`readyMilestone` decides whether a milestone note is buildable: it carries `entities:`,
a `gherkin` block that is not written in the first person, a scenario that names somebody
who acts, a readable `surface:`, and `tools:` when that surface is an agent. It refuses
with one sentence a seat can act on, and says who the refusal belongs to — the note's
author, nobody yet, or a profile's own hold.

`nextAction` derives the one thing to do next from what is on disk: repair a note, write a
plan, ask the user, dispatch, or hold. Deriving it means calling it twice is free, nothing
has to be armed by whoever noticed a transition, and the pipeline is testable in a temp
directory. `runKnowledgeReconcile` flattens the same answer to paths, for a driver reading
it across a process boundary.

Both take a profile's frontmatter keys, so a profile's gate is handed notes carrying its
own keys and a repair to one of them refunds the attempt budget. `readMilestones` takes
those keys too.
