---
'@pikku/knowledge': patch
---

feat(knowledge): a slice is now a milestone

One concept, two words. The profile called the unit of buildable work a `slice`
while everything a user reads called it a milestone, so every console rendering
this graph carried a relabel to hide the difference. The word is now milestone
everywhere, and a bundle written before the rename still reads.

Renamed: `SLICE_STATUSES` → `MILESTONE_STATUSES`, `SliceStatus` →
`MilestoneStatus`, the `slices` section → `milestones`, `type: slice` →
`type: milestone`, and the `knowledge-slice-*` findings → `knowledge-milestone-*`.
Anything matching on a finding id needs the new prefix.

**Existing bundles keep working.** `isMilestone()` accepts `type: slice`
alongside `type: milestone`, and a `knowledge/slices/` directory keeps the
milestone description and its place in the reading order rather than sorting to
the end as a section nothing declares. Writers emit the new names; readers
accept both, so a base migrates as its notes are rewritten rather than in one
cutover. `MILESTONE_TYPE`, `MILESTONE_SECTION` and `canonicalSection()` are
exported for a profile that has to write or resolve those names itself.
