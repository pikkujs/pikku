---
'@pikku/knowledge': patch
---

feat(knowledge): a slice is now a milestone

One concept, two words. The profile called the unit of buildable work a `slice`
while everything a user reads called it a milestone, so every console rendering
this graph carried a relabel to hide the difference. The word is now milestone
everywhere.

Renamed: `SLICE_STATUSES` → `MILESTONE_STATUSES`, `SliceStatus` →
`MilestoneStatus`, the `slices` section → `milestones`, `type: slice` →
`type: milestone`, and the `knowledge-slice-*` findings → `knowledge-milestone-*`.
Anything matching on a finding id needs the new prefix.

**This is a break, not a migration.** The old name is not read: a note still
saying `type: slice` is no longer a milestone to any gate, and a
`knowledge/slices/` directory is a section the profile does not name — it sorts
last and carries no description. Rename the directory and the frontmatter.
`MILESTONE_TYPE` and `MILESTONE_SECTION` are exported for a profile that has to
write those names itself.
