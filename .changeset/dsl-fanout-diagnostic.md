---
'@pikku/inspector': patch
---

Make the unmodellable-for-of diagnostic tell you what is actually wrong. It always blamed the iterable ("its iterable must be a data array"), which was false whenever the real cause was a `workflow.do` nested inside an `if`/`switch` — a DSL fanout body is a flat list of steps with no branch member, so the diagnostic now says so and points at `.filter` or `pikkuWorkflowComplexFunc`. Also stops the same diagnostic firing on a `for-of` that contains no workflow call at all: a loop that only massages locals has no step to lose, so erroring on it was a false positive.
