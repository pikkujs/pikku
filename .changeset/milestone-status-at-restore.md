---
'@pikku/knowledge': patch
---

`holdMilestoneLifecycle` now restores a milestone's `statusAt` when a note-rewriting
turn drops it, not only when the `status` itself drifted. A rewrite that kept `built`
and lost the stamp beside it passed the old status-only comparison, leaving a note
whose state nothing could tell from a milestone that was really dispatched, built and
closed by the gates.
